const prisma = require("../utils/prisma.client");
function makeError(msg, status) { const e = new Error(msg); e.status = status; return e; }

class ServicesService {
  async create(tenantId, data) {
    const depositAmount = data.depositAmount !== undefined ? data.depositAmount : data.price;
    return prisma.service.create({ data: { ...data, depositAmount, tenantId }, include: { category: true } });
  }

  async findAll(tenantId, activeOnly = true) {
    return prisma.service.findMany({
      where: { tenantId, ...(activeOnly ? { isActive: true } : {}) },
      include: { category: true, staffServices: { include: { staff: true } } },
      orderBy: { name: "asc" },
    });
  }

  async findOne(tenantId, id) {
    const s = await prisma.service.findFirst({ where: { id, tenantId }, include: { category: true } });
    if (!s) throw makeError("Service not found", 404);
    return s;
  }

  async update(tenantId, id, data) {
    await this.findOne(tenantId, id);
    return prisma.service.update({ where: { id }, data, include: { category: true } });
  }

  async remove(tenantId, id) {
    await this.findOne(tenantId, id);
    const hasBookings = await prisma.booking.count({
      where: { serviceId: id, tenantId, status: { in: ["CONFIRMED", "PENDING_PAYMENT"] } },
    });
    if (hasBookings > 0) return prisma.service.update({ where: { id }, data: { isActive: false } });
    return prisma.service.delete({ where: { id } });
  }

  async assignStaff(tenantId, serviceId, staffId) {
    await this.findOne(tenantId, serviceId);
    return prisma.staffService.upsert({
      where: { staffId_serviceId: { staffId, serviceId } },
      update: {},
      create: { staffId, serviceId },
    });
  }

  async removeStaff(serviceId, staffId) {
    return prisma.staffService.delete({ where: { staffId_serviceId: { staffId, serviceId } } });
  }
}

module.exports = new ServicesService();

