import { Controller, Post, Body, Headers, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { KafkaService } from '../common/kafka/kafka.service';
import * as crypto from 'crypto';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private prisma: PrismaService, private kafka: KafkaService) {}

  @Post('razorpay')
  async razorpayWebhook(@Req() req: any, @Headers('x-razorpay-signature') signature: string) {
    // Verify webhook signature
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(req.body))
      .digest('hex');
    if (signature !== expectedSignature) {
      throw new Error('Invalid signature');
    }

    const event = req.body;
    const eventId = event.id || event.event_id;

    // Check idempotency
    const existing = await this.prisma.payment.findFirst({ where: { webhook_event_id: eventId } });
    if (existing) {
      return { status: 'already_processed' };
    }

    if (event.event === 'payment.captured') {
      const paymentEntity = event.payload.payment.entity;
      const orderId = paymentEntity.order_id;
      // Find booking by order
      // This is simplified; in production link via booking.razorpay_order_id
      await this.prisma.$transaction(async (tx) => {
        // Create payment record
        await tx.payment.create({
          data: {
            booking_id: event.payload.payment.entity.notes?.bookingId || '',
            tenant_id: event.payload.payment.entity.notes?.tenantId || '',
            razorpay_order_id: orderId,
            razorpay_payment_id: paymentEntity.id,
            amount: paymentEntity.amount / 100,
            currency: paymentEntity.currency,
            status: 'CAPTURED',
            webhook_event_id: eventId,
          },
        });
      });
      await this.kafka.publish('booking.confirmed', event.payload.payment.entity);
    } else if (event.event === 'payment.failed') {
      await this.kafka.publish('booking.payment_failed', event.payload.payment.entity);
    }

    return { status: 'ok' };
  }
}
