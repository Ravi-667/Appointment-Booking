import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StaffService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.staff.findMany({ where: { tenant_id: tenantId, is_active: true } });
  }

  async create(tenantId: string, dto: any) {
    return this.prisma.staff.create({
      data: { tenant_id: tenantId, name: dto.name, bio: dto.bio, user_id: dto.userId },
    });
  }

  async invite(tenantId: string, dto: any) {
    // TODO: create user with role STAFF, send invite email with token
    return this.prisma.staff.create({
      data: { tenant_id: tenantId, name: dto.name },
    });
  }

  async getSchedule(staffId: string, month: string) {
    const [year, m] = month.split('-').map(Number);
    const start = new Date(year, m - 1, 1);
    const end = new Date(year, m, 0);
    return this.prisma.staffSchedule.findMany({
      where: { staff_id: staffId, date: { gte: start, lte: end } },
    });
  }

  async setSchedule(staffId: string, date: string, dto: any) {
    return this.prisma.staffSchedule.upsert({
      where: { staff_id_date: { staff_id: staffId, date: new Date(date) } },
      update: { is_off: dto.isOff, start_time: dto.startTime, end_time: dto.endTime },
      create: { staff_id: staffId, date: new Date(date), is_off: dto.isOff || false, start_time: dto.startTime, end_time: dto.endTime },
    });
  }

  async removeSchedule(staffId: string, date: string) {
    return this.prisma.staffSchedule.deleteMany({ where: { staff_id: staffId, date: new Date(date) } });
  }
}
