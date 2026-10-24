import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId?: string) {
    return this.prisma.user.findMany({
      where: tenantId ? { tenant_id: tenantId } : {},
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        email_verified: true,
        is_active: true,
        created_at: true,
      },
    });
  }

  async findOne(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        tenant_id: true,
        email_verified: true,
        is_active: true,
        created_at: true,
      },
    });
  }

  async update(id: string, data: any) {
    return this.prisma.user.update({ where: { id }, data });
  }

  async deactivate(id: string) {
    return this.prisma.user.update({ where: { id }, data: { is_active: false } });
  }
}
