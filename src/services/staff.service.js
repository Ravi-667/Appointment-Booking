const prisma = require("../utils/prisma.client");
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
    const staffList = await prisma.staff.findMany({
      where,
      include: { staffServices: { include: { service: true } } },
      orderBy: { name: "asc" },
    });

    try {
      if (UUID_REGEX.test(tenantId) && prisma.user && typeof prisma.user.findMany === "function") {
        const staffUsers = await prisma.user.findMany({
          where: { tenantId, role: "STAFF" },
          select: { id: true, email: true, isActive: true },
        });
        const userEmailSet = new Set(staffUsers.map(u => (u.email || "").toLowerCase().trim()));
        return staffList.map(s => ({
          ...s,
          hasPortalAccess: userEmailSet.has((s.email || "").toLowerCase().trim()),
        }));
      }
    } catch {}

    return staffList;
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

    // Automatically provision staff portal credentials for newly accepted staff
    if (application.email && UUID_REGEX.test(tenantId) && UUID_REGEX.test(staff.id)) {
      await this.provisionStaffCredentials(tenantId, staff.id, {
        email: application.email,
        notes,
      }).catch(e => {
        console.warn("Staff auto-provision credentials error:", e.message);
      });
    }

    return staff;
  }

  /**
   * Provision or reset staff portal login credentials.
   * Generates or sets custom credentials, creates/updates User account (role: STAFF),
   * sends the credentials via email, and sends an internal chat message between Owner and Staff.
   */
  async provisionStaffCredentials(tenantId, staffId, { email: customEmail, password: customPassword, io, originUrl } = {}) {
    if (!tenantId) throw makeError("tenantId is required", 400);
    const where = (UUID_REGEX.test(staffId) && UUID_REGEX.test(tenantId))
      ? { id: staffId, tenantId }
      : { id: staffId };
    const staff = await prisma.staff.findFirst({
      where,
      include: { tenant: true },
    });
    if (!staff) throw makeError("Staff member not found", 404);

    const email = (customEmail || staff.email || "").toLowerCase().trim();
    if (!email) throw makeError("A valid email address is required to provide staff login credentials", 400);

    // Generate secure readable temporary password if not provided
    const tempPassword = customPassword && customPassword.trim()
      ? customPassword.trim()
      : `Staff@${(staff.tenant?.slug || "portal").replace(/[^a-zA-Z0-9]/g, "")}2026!`;

    const bcrypt = require("bcrypt");
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    let userRecord = null;
    const existingUser = await prisma.user.findFirst({ where: { email } });
    if (existingUser) {
      userRecord = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          tenantId,
          role: "STAFF",
          name: staff.name,
          passwordHash,
          emailVerified: true,
          isActive: true,
        },
      });
    } else {
      userRecord = await prisma.user.create({
        data: {
          tenantId,
          email,
          name: staff.name,
          role: "STAFF",
          passwordHash,
          emailVerified: true,
          isActive: true,
        },
      });
    }

    // Update staff email if different
    if (staff.email !== email) {
      await prisma.staff.update({ where: { id: staffId }, data: { email } });
    }

    const loginUrl = originUrl ? `${originUrl}/login` : "/login";

    // 1. Send Credentials via Email
    const notificationsService = require("./notifications.service");
    await notificationsService.sendStaffCredentialsEmail({
      to: email,
      staffName: staff.name,
      tenantName: staff.tenant?.name || "Our Business",
      loginUrl,
      email,
      temporaryPassword: tempPassword,
      tenantId,
    }).catch(e => console.warn("Staff credentials email warning:", e.message));

    // 2. Post Credentials in dedicated Owner-Staff Internal Chat Thread
    const chatService = require("./chat.service");
    const threadId = `staff_${staff.id}`;
    const credMessage = `🔐 Staff Portal Login Credentials Generated\n\nHello ${staff.name},\nYour dedicated Staff Member Portal account is ready for ${staff.tenant?.name || "our team"}.\n\n• Portal Login: ${loginUrl}\n• Email / Username: ${email}\n• Temporary Password: ${tempPassword}\n\nPlease sign in at /login to view your assigned client appointments, manage your schedule, and chat directly with your clients and salon owner.`;

    await chatService.sendMessage({
      tenantId,
      threadId,
      staffId: staff.id,
      recipientEmail: email,
      senderType: "OWNER",
      senderName: staff.tenant?.name || "Business Owner",
      senderEmail: staff.tenant?.email || "owner@bookingapp.local",
      message: credMessage,
      io,
    }).catch(e => console.warn("Staff credentials chat message warning:", e.message));

    // 3. Create In-App Notification for Staff User
    if (prisma.inAppNotification && userRecord) {
      await prisma.inAppNotification.create({
        data: {
          userId: userRecord.id,
          tenantId,
          type: "STAFF_CREDENTIALS_GENERATED",
          title: "Welcome to the Staff Portal!",
          message: `Your login account for ${staff.tenant?.name} is ready. Welcome to the team!`,
          link: "/staff/dashboard",
          isRead: false,
        },
      }).catch(() => {});
    }

    return {
      success: true,
      staffId: staff.id,
      staffName: staff.name,
      email,
      temporaryPassword: tempPassword,
      userId: userRecord.id,
    };
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

