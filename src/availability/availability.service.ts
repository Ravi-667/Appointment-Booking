import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { addMinutes, setHours, setMinutes, isAfter, isBefore, format } from 'date-fns';
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz';

@Injectable()
export class AvailabilityService {
  constructor(private prisma: PrismaService, private redis: RedisService) {}

  async getAvailability(query: any) {
    const { serviceId, staffId, date, tenantId } = query;
    const cacheKey = `avail:${tenantId}:${staffId || 'any'}:${date}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const service = await this.prisma.service.findUnique({ where: { id: serviceId } });
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!service || !tenant) throw new Error('Service or tenant not found');

    // Step 1: Get business hours for the day
    const targetDate = new Date(date);
    const dayOfWeek = targetDate.getDay();
    const hours = await this.prisma.businessHour.findFirst({ where: { tenant_id: tenantId, day_of_week: dayOfWeek } });
    if (!hours || !hours.is_open) return [];

    // Step 2: Check holiday
    const holiday = await this.prisma.holiday.findFirst({ where: { tenant_id: tenantId, date: targetDate } });
    if (holiday) return [];

    // Step 3: Check staff override
    let openTime = hours.open_time;
    let closeTime = hours.close_time;
    if (staffId) {
      const override = await this.prisma.staffSchedule.findFirst({ where: { staff_id: staffId, date: targetDate } });
      if (override) {
        if (override.is_off) return [];
        if (override.start_time) openTime = override.start_time;
        if (override.end_time) closeTime = override.end_time;
      }
    }

    // Step 4: Get confirmed bookings
    const bookings = await this.prisma.booking.findMany({
      where: {
        tenant_id: tenantId,
        staff_id: staffId || undefined,
        status: { notIn: ['CANCELLED', 'PAYMENT_FAILED'] },
        start_time: { gte: new Date(`${date}T00:00:00Z`), lt: new Date(`${date}T23:59:59.999Z`) },
      },
    });

    // Step 5: Get active holds from Redis/DB
    const holds = await this.prisma.bookingHold.findMany({
      where: {
        tenant_id: tenantId,
        staff_id: staffId || undefined,
        expires_at: { gt: new Date() },
        start_time: { gte: new Date(`${date}T00:00:00Z`), lt: new Date(`${date}T23:59:59.999Z`) },
      },
    });

    // Step 6: Generate candidate slots
    const duration = service.duration_minutes + (service.buffer_minutes || tenant.buffer_minutes || 0);
    const slots: any[] = [];
    const [oh, om] = openTime.toString().split(':').map(Number);
    const [ch, cm] = closeTime.toString().split(':').map(Number);
    let current = setMinutes(setHours(new Date(`${date}T00:00:00Z`), oh), om);
    const close = setMinutes(setHours(new Date(`${date}T00:00:00Z`), ch), cm);

    while (isBefore(addMinutes(current, duration), close) || addMinutes(current, duration).getTime() === close.getTime()) {
      const slotEnd = addMinutes(current, duration);
      // Step 7: Validate
      const now = new Date();
      if (isAfter(current, now)) {
        // Check lead time
        if ((current.getTime() - now.getTime()) / 3600000 >= tenant.booking_lead_time_hours) {
          // Check advance limit
          const daysDiff = (current.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
          if (daysDiff <= tenant.booking_advance_limit_days) {
            // Check overlaps
            const overlappingBookings = bookings.filter((b) => isBefore(current, b.end_time) && isAfter(slotEnd, b.start_time)).length;
            const overlappingHolds = holds.filter((h) => isBefore(current, h.end_time) && isAfter(slotEnd, h.start_time)).length;
            const total = overlappingBookings + overlappingHolds;
            if (total < service.max_concurrent) {
              slots.push({
                startTime: current.toISOString(),
                endTime: slotEnd.toISOString(),
                available: true,
              });
            }
          }
        }
      }
      current = addMinutes(current, service.duration_minutes + (service.buffer_minutes || tenant.buffer_minutes || 0));
      if (current >= close) break;
    }

    // Cache for 30 seconds
    await this.redis.set(cacheKey, JSON.stringify(slots), 30);
    return slots;
  }
}
