import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async getAllTenants(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [tenants, total] = await Promise.all([
      this.prisma.tenant.findMany({ skip, take: limit, orderBy: { created_at: 'desc' } }),
      this.prisma.tenant.count(),
    ]);
    return { tenants, total, page, limit };
  }

  async getTenantDetail(id: string) {
    return this.prisma.tenant.findUnique({
      where: { id },
      include: { users: true, bookings: true, services: true },
    });
  }

  async updateTenant(id: string, dto: any) {
    return this.prisma.tenant.update({ where: { id }, data: dto });
  }

  async getPlatformStats() {
    const [tenants, bookings, users] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.booking.count(),
      this.prisma.user.count(),
    ]);
    return { tenants, bookings, users };
  }

  async getAuditLogs(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const logs = await this.prisma.auditLog.findMany({ skip, take: limit, orderBy: { created_at: 'desc' } });
    return logs;
  }
}
