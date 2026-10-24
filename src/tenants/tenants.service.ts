import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TenantsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: any) {
    // Generate slug from name
    const slug = dto.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    // Check collision
    let finalSlug = slug;
    let counter = 1;
    while (await this.prisma.tenant.findUnique({ where: { slug: finalSlug } })) {
      finalSlug = `${slug}-${counter++}`;
    }
    const tenant = await this.prisma.tenant.create({
      data: {
        name: dto.name,
        slug: finalSlug,
        email: dto.email,
        timezone: dto.timezone || 'Asia/Kolkata',
        currency: dto.currency || 'INR',
        category: dto.category,
      },
    });
    // Create default business hours (Mon-Sat 9-6, Sun off)
    for (let i = 1; i <= 6; i++) {
      await this.prisma.businessHour.create({
        data: {
          tenant_id: tenant.id,
          day_of_week: i,
          open_time: '09:00',
          close_time: '18:00',
          is_open: true,
        },
      });
    }
    await this.prisma.businessHour.create({
      data: { tenant_id: tenant.id, day_of_week: 0, open_time: '09:00', close_time: '18:00', is_open: false },
    });
    return { tenant, bookingUrl: `/book/${tenant.slug}` };
  }

  async findOne(id: string) {
    return this.prisma.tenant.findUnique({ where: { id } });
  }

  async update(id: string, dto: any) {
    return this.prisma.tenant.update({ where: { id }, data: dto });
  }

  async getHours(id: string) {
    return this.prisma.businessHour.findMany({ where: { tenant_id: id }, orderBy: { day_of_week: 'asc' } });
  }

  async updateHours(id: string, hours: any[]) {
    // Replace entire schedule
    await this.prisma.businessHour.deleteMany({ where: { tenant_id: id } });
    const data = hours.map((h) => ({ tenant_id: id, ...h }));
    await this.prisma.businessHour.createMany({ data });
    return this.getHours(id);
  }

  async getHolidays(id: string) {
    return this.prisma.holiday.findMany({ where: { tenant_id: id }, orderBy: { date: 'asc' } });
  }

  async addHoliday(id: string, dto: any) {
    return this.prisma.holiday.create({ data: { tenant_id: id, date: new Date(dto.date), reason: dto.reason } });
  }

  async removeHoliday(id: string, date: string) {
    return this.prisma.holiday.deleteMany({ where: { tenant_id: id, date: new Date(date) } });
  }
}
