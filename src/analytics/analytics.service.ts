import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getStats(tenantId: string, period: string) {
    // Simplified: compute from bookings
    const days = period === '30d' ? 30 : period === '90d' ? 90 : 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const bookings = await this.prisma.booking.findMany({
      where: { tenant_id: tenantId, created_at: { gte: since } },
    });
    const revenue = bookings
      .filter((b) => b.status === 'CONFIRMED')
      .reduce((sum, b) => sum + parseFloat(b.deposit_amount.toString()), 0);
    return {
      period,
      bookingsCount: bookings.length,
      confirmed: bookings.filter((b) => b.status === 'CONFIRMED').length,
      cancelled: bookings.filter((b) => b.status === 'CANCELLED').length,
      noShow: bookings.filter((b) => b.status === 'NO_SHOW').length,
      revenue,
    };
  }
}
