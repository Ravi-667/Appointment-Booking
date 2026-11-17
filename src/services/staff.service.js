const prisma = require("../utils/prisma.client");
function makeError(msg, status) { const e = new Error(msg); e.status = status; return e; }

class StaffService {
  async create(tenantId, data) {
    return prisma.staff.create({ data: { ...data, tenantId } });
  }

  async findAll(tenantId) {
    return prisma.staff.findMany({
      where: { tenantId, isActive: true },
      include: { staffServices: { include: { service: true } } },
      orderBy: { name: "asc" },
    });
  }

  async findOne(tenantId, id) {
    const s = await prisma.staff.findFirst({ where: { id, tenantId } });
    if (!s) throw makeError("Staff not found", 404);
    return s;
  }

  async update(tenantId, id, data) {
    await this.findOne(tenantId, id);
    return prisma.staff.update({ where: { id }, data });
  }

  async deactivate(tenantId, id) {
    await this.findOne(tenantId, id);
    return prisma.staff.update({ where: { id }, data: { isActive: false } });
  }

  async setScheduleOverride(staffId, date, isOff, startTime, endTime) {
    return prisma.staffSchedule.upsert({
      where: { staffId_date: { staffId, date: new Date(date) } },
      update: { isOff, startTime: startTime || null, endTime: endTime || null },
      create: { staffId, date: new Date(date), isOff, startTime: startTime || null, endTime: endTime || null },
    });
  }

  async removeScheduleOverride(staffId, date) {
    return prisma.staffSchedule.deleteMany({ where: { staffId, date: new Date(date) } });
  }
}

module.exports = new StaffService();

