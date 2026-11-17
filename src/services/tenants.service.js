const prisma = require("../utils/prisma.client");

function makeError(msg, status) { const e = new Error(msg); e.status = status; return e; }

function generateSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim()
    .replace(/\s+/g, "-").replace(/-+/g, "-").substring(0, 50);
}

class TenantsService {
  async create(data, ownerId) {
    const slug = generateSlug(data.name);
    if (await prisma.tenant.findUnique({ where: { slug } })) {
      throw makeError("Business name already taken", 409);
    }
    return prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: data.name, slug, email: data.email, category: data.category, phone: data.phone, timezone: data.timezone || "Asia/Kolkata" },
      });
      await tx.user.update({ where: { id: ownerId }, data: { tenantId: tenant.id } });
      await tx.businessHour.createMany({
        data: [0,1,2,3,4,5,6].map((day) => ({
          tenantId: tenant.id, dayOfWeek: day, isOpen: day !== 0, openTime: "09:00", closeTime: "18:00",
        })),
      });
      return tenant;
    });
  }

  async findOne(id) {
    const t = await prisma.tenant.findUnique({ where: { id }, include: { businessHours: { orderBy: { dayOfWeek: "asc" } }, holidays: true } });
    if (!t) throw makeError("Business not found", 404);
    return t;
  }

  async findBySlug(slug) {
    const t = await prisma.tenant.findUnique({
      where: { slug },
      include: { businessHours: { orderBy: { dayOfWeek: "asc" } }, services: { where: { isActive: true }, include: { category: true } } },
    });
    if (!t) throw makeError("Business not found", 404);
    return t;
  }

  async update(id, data) {
    return prisma.tenant.update({ where: { id }, data });
  }

  async updateBusinessHours(tenantId, hours) {
    await prisma.$transaction(hours.map((h) =>
      prisma.businessHour.upsert({
        where: { tenantId_dayOfWeek: { tenantId, dayOfWeek: h.dayOfWeek } },
        update: { isOpen: h.isOpen, openTime: h.openTime, closeTime: h.closeTime },
        create: { tenantId, ...h },
      })
    ));
    return this.findOne(tenantId);
  }

  async addHoliday(tenantId, date, reason) {
    return prisma.holiday.create({ data: { tenantId, date: new Date(date), reason } });
  }

  async removeHoliday(tenantId, holidayId) {
    return prisma.holiday.deleteMany({ where: { id: holidayId, tenantId } });
  }
}

module.exports = new TenantsService();

