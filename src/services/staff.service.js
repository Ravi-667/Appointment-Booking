const prisma = require("../utils/prisma.client");
function makeError(msg, status) { const e = new Error(msg); e.status = status; return e; }

class StaffService {
  async create(tenantId, data) {
    const { serviceIds, ...rest } = data;
    const staff = await prisma.staff.create({ data: { ...rest, tenantId } });

    if (serviceIds && Array.isArray(serviceIds) && serviceIds.length > 0) {
      const records = serviceIds.map(sId => ({ staffId: staff.id, serviceId: sId }));
      await prisma.staffService.createMany({ data: records, skipDuplicates: true });
    } else if (serviceIds && typeof serviceIds === "string") {
      await prisma.staffService.create({ data: { staffId: staff.id, serviceId: serviceIds } }).catch(() => {});
    }

    return staff;
  }

  async findAll(tenantId, includeInactive = false) {
    const where = { tenantId };
    if (!includeInactive) where.isActive = true;
    return prisma.staff.findMany({
      where,
      include: { staffServices: { include: { service: true } } },
      orderBy: { name: "asc" },
    });
  }

  async findOne(tenantId, id) {
    const s = await prisma.staff.findFirst({
      where: { id, tenantId },
      include: { staffServices: { include: { service: true } } },
    });
    if (!s) throw makeError("Staff not found", 404);
    return s;
  }

  async update(tenantId, id, data) {
    await this.findOne(tenantId, id);
    const { serviceIds, ...rest } = data;
    const updated = await prisma.staff.update({ where: { id }, data: rest });

    if (serviceIds !== undefined) {
      await prisma.staffService.deleteMany({ where: { staffId: id } });
      const ids = Array.isArray(serviceIds) ? serviceIds : [serviceIds].filter(Boolean);
      if (ids.length > 0) {
        await prisma.staffService.createMany({
          data: ids.map(sId => ({ staffId: id, serviceId: sId })),
          skipDuplicates: true,
        });
      }
    }
    return updated;
  }

  async deactivate(tenantId, id) {
    await this.findOne(tenantId, id);
    return prisma.staff.update({ where: { id }, data: { isActive: false } });
  }

  async activate(tenantId, id) {
    await this.findOne(tenantId, id);
    return prisma.staff.update({ where: { id }, data: { isActive: true } });
  }

  // ─── Staff Candidate Job Applications ───────────────────────────────────

  async applyForStaff(tenantId, data) {
    if (!tenantId) throw makeError("tenantId is required", 400);
    if (!data.applicantName || !data.applicantName.trim()) throw makeError("Applicant Name is required", 400);
    if (!data.email || !data.email.trim()) throw makeError("Email is required", 400);
    if (!data.roleTitle || !data.roleTitle.trim()) throw makeError("Role Title is required", 400);

    const app = await prisma.staffApplication.create({
      data: {
        tenantId,
        applicantName: data.applicantName.trim(),
        email: data.email.toLowerCase().trim(),
        phone: data.phone ? data.phone.trim() : null,
        roleTitle: data.roleTitle.trim(),
        experience: data.experience ? data.experience.trim() : null,
        coverNote: data.coverNote ? data.coverNote.trim() : null,
        status: "PENDING",
      },
    });

    const notificationsService = require("./notifications.service");
    await notificationsService.notifyStaffApplicationReceived(app.id).catch(e => {
      console.warn("Staff application notification error:", e.message);
    });

    return app;
  }

  async getApplications(tenantId, status) {
    const where = { tenantId };
    if (status) where.status = status;
    return prisma.staffApplication.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
  }

  async acceptApplication(tenantId, applicationId, { serviceIds, roleTitle, notes } = {}) {
    const application = await prisma.staffApplication.findFirst({
      where: { id: applicationId, tenantId },
    });
    if (!application) throw makeError("Application not found", 404);
    if (application.status === "ACCEPTED") throw makeError("Application is already accepted", 400);

    // Create staff record
    const staff = await prisma.staff.create({
      data: {
        tenantId,
        name: application.applicantName,
        roleTitle: roleTitle || application.roleTitle,
        email: application.email,
        phone: application.phone,
        bio: application.experience ? `${application.roleTitle} with ${application.experience}. ${application.coverNote || ""}`.trim() : application.coverNote,
        isActive: true,
      },
    });

    // Link services if provided
    if (serviceIds) {
      const ids = Array.isArray(serviceIds) ? serviceIds : [serviceIds].filter(Boolean);
      if (ids.length > 0) {
        await prisma.staffService.createMany({
          data: ids.map(sId => ({ staffId: staff.id, serviceId: sId })),
          skipDuplicates: true,
        });
      }
    }

    // Mark application as accepted
    await prisma.staffApplication.update({
      where: { id: applicationId },
      data: {
        status: "ACCEPTED",
        ownerNotes: notes || "Accepted and hired to staff team",
      },
    });

    const notificationsService = require("./notifications.service");
    await notificationsService.notifyStaffApplicationDecision(applicationId, "ACCEPTED", notes).catch(e => {
      console.warn("Staff accepted notification error:", e.message);
    });

    return staff;
  }

  async rejectApplication(tenantId, applicationId, notes) {
    const application = await prisma.staffApplication.findFirst({
      where: { id: applicationId, tenantId },
    });
    if (!application) throw makeError("Application not found", 404);

    const updated = await prisma.staffApplication.update({
      where: { id: applicationId },
      data: {
        status: "REJECTED",
        ownerNotes: notes || "Not selected at this time",
      },
    });

    const notificationsService = require("./notifications.service");
    await notificationsService.notifyStaffApplicationDecision(applicationId, "REJECTED", notes).catch(e => {
      console.warn("Staff rejected notification error:", e.message);
    });

    return updated;
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

