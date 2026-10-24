import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ServicesService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string, activeOnly = true) {
    return this.prisma.service.findMany({
      where: { tenant_id: tenantId, ...(activeOnly ? { is_active: true } : {}) },
      orderBy: { created_at: 'asc' },
    });
  }

  async create(tenantId: string, dto: any) {
    if (dto.depositAmount && dto.price && parseFloat(dto.depositAmount) > parseFloat(dto.price)) {
      throw new Error('depositAmount cannot be greater than price');
    }
    return this.prisma.service.create({
      data: {
        tenant_id: tenantId,
        name: dto.name,
        description: dto.description,
        category: dto.category,
        duration_minutes: dto.durationMinutes,
        price: dto.price,
        deposit_amount: dto.depositAmount || 0,
        max_concurrent: dto.maxConcurrent || 1,
        buffer_minutes: dto.bufferMinutes || 0,
      },
    });
  }

  async update(id: string, dto: any) {
    return this.prisma.service.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    // Soft delete if bookings exist, hard delete otherwise
    const bookings = await this.prisma.booking.count({ where: { service_id: id, status: { not: 'CANCELLED' } } });
    if (bookings > 0) {
      return this.prisma.service.update({ where: { id }, data: { is_active: false } });
    }
    return this.prisma.service.delete({ where: { id } });
  }

  async assignStaff(serviceId: string, staffId: string) {
    return this.prisma.staffService.create({
      data: { service_id: serviceId, staff_id: staffId },
    });
  }

  async unassignStaff(serviceId: string, staffId: string) {
    return this.prisma.staffService.delete({
      where: { staff_id_service_id: { staff_id: staffId, service_id: serviceId } },
    });
  }
}
