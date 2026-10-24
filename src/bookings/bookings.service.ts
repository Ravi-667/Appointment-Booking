import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { KafkaService } from '../common/kafka/kafka.service';
import * as crypto from 'crypto';
import Razorpay from 'razorpay';

@Injectable()
export class BookingsService {
  private razorpay: Razorpay;

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private kafka: KafkaService,
  ) {
    this.razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID || '',
      key_secret: process.env.RAZORPAY_KEY_SECRET || '',
    });
  }

  async holdSlot(dto: any) {
    const { tenantId, staffId, serviceId, startTime, customerEmail, customerName } = dto;
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const holdKey = `hold:${tenantId}:${staffId || 'any'}:${startTime}`;
    // Use SET NX (atomic) — TTL 600s
    const result = await this.redis.setNX(holdKey, JSON.stringify({ sessionToken, customerEmail }), 600);
    if (result !== 'OK') {
      throw new ConflictException('Slot already held by another user');
    }
    const service = await this.prisma.service.findUnique({ where: { id: serviceId } });
    const endTime = new Date(new Date(startTime).getTime() + (service?.duration_minutes || 30) * 60000);
    const hold = await this.prisma.bookingHold.create({
      data: {
        tenant_id: tenantId,
        staff_id: staffId,
        service_id: serviceId,
        start_time: new Date(startTime),
        end_time: endTime,
        session_token: sessionToken,
        expires_at: new Date(Date.now() + 600 * 1000),
      },
    });
    return { holdId: hold.id, sessionToken, expiresAt: hold.expires_at };
  }

  async createBooking(dto: any) {
    // Verify session token
    const hold = await this.prisma.bookingHold.findFirst({
      where: { id: dto.holdId, session_token: dto.sessionToken },
    });
    if (!hold) throw new ConflictException('Invalid or expired hold');
    if (hold.expires_at < new Date()) throw new ConflictException('Hold expired');

    const service = await this.prisma.service.findUnique({ where: { id: hold.service_id } });
    const price = parseFloat(service?.price.toString() || '0');
    const depositAmount = parseFloat(service?.deposit_amount.toString() || '0');

    try {
      const booking = await this.prisma.$transaction(async (tx) => {
        // Create booking in PENDING_PAYMENT
        const b = await tx.booking.create({
          data: {
            tenant_id: hold.tenant_id,
            service_id: hold.service_id,
            staff_id: hold.staff_id,
            customer_name: dto.customerName,
            customer_email: dto.customerEmail,
            customer_phone: dto.customerPhone,
            customer_notes: dto.customerNotes,
            start_time: hold.start_time,
            end_time: hold.end_time,
            status: 'PENDING_PAYMENT',
            price,
            deposit_amount: depositAmount,
          },
        });
        // Create Razorpay order
        const order = await this.razorpay.orders.create({
          amount: Math.round(depositAmount * 100),
          currency: 'INR',
          receipt: b.id,
        });
        await tx.booking.update({ where: { id: b.id }, data: {} }); // placeholder
        // Delete hold
        await tx.bookingHold.delete({ where: { id: hold.id } });
        return { booking: b, orderId: order.id };
      }, { isolationLevel: 'Serializable' });

      // Release Redis hold
      const holdKey = `hold:${hold.tenant_id}:${hold.staff_id || 'any'}:${hold.start_time.toISOString()}`;
      await this.redis.del(holdKey);

      await this.kafka.publish('booking.created', {
        bookingId: booking.booking.id,
        tenantId: hold.tenant_id,
        serviceId: hold.service_id,
        staffId: hold.staff_id,
        startTime: hold.start_time,
        amount: depositAmount,
      });

      return { bookingId: booking.booking.id, razorpayOrderId: booking.orderId, amount: depositAmount * 100 };
    } catch (e: any) {
      if (e.code === '23P01') {
        // Exclusion constraint violation
        throw new ConflictException('Slot just taken by another booking');
      }
      throw e;
    }
  }

  async cancelBooking(id: string, reason: string) {
    const booking = await this.prisma.booking.findUnique({ where: { id } });
    if (!booking) throw new Error('Booking not found');
    await this.prisma.booking.update({ where: { id }, data: { status: 'CANCELLED', cancellation_reason: reason } });
    await this.kafka.publish('booking.cancelled', { bookingId: id, reason });
    return { message: 'Booking cancelled' };
  }

  async rescheduleBooking(id: string, newStartTime: string) {
    // Check availability, create new booking, mark old as RESCHEDULED
    const old = await this.prisma.booking.findUnique({ where: { id } });
    if (!old) throw new Error('Booking not found');
    await this.prisma.booking.update({ where: { id }, data: { status: 'RESCHEDULED' } });
    // TODO: full reschedule logic with transaction
    return { message: 'Reschedule initiated' };
  }
}
