const nodemailer = require("nodemailer");
const prisma = require("../utils/prisma.client");
const { formatDateTime12 } = require("../utils/datetime.utils");

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function toDbUuid(id) {
  return (typeof id === "string" && UUID_REGEX.test(id)) ? id : null;
}
function isLikelyUuid(id) {
  return typeof id === "string" && (UUID_REGEX.test(id) || (!id.includes("-") && id.length === 32));
}

class NotificationsService {
  constructor() {
    this.io = null;
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "localhost",
      port: parseInt(process.env.SMTP_PORT || "1025"),
      secure: false,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }

  setIo(io) {
    this.io = io;
  }

  // ─── In-App Notifications Management ────────────────────────────────────────

  async createInApp({ tenantId, userId, userEmail, role, title, message, type, link, metadata }) {
    try {
      const dbTenantId = toDbUuid(tenantId);
      const dbUserId = toDbUuid(userId);

      const notif = await prisma.inAppNotification.create({
        data: {
          tenantId: dbTenantId,
          userId: dbUserId,
          userEmail: userEmail ? userEmail.toLowerCase().trim() : null,
          role: role || "CUSTOMER",
          title: title || "Notification",
          message: message || "",
          type: type || "SYSTEM",
          link: link || null,
          metadata: metadata || undefined,
        },
      });

      // Real-time broadcast via Socket.IO
      if (this.io) {
        if (tenantId) {
          this.io.to(`tenant:${tenantId}`).emit("notification:new", notif);
        }
        if (userEmail) {
          this.io.to(`user:${userEmail.toLowerCase().trim()}`).emit("notification:new", notif);
        }
        if (userId) {
          this.io.to(`user:${userId}`).emit("notification:new", notif);
        }
      }

      return notif;
    } catch (err) {
      console.warn("Failed to create in-app notification:", err.message);
      return null;
    }
  }

  async getInAppNotifications({ tenantId, userId, userEmail, limit = 20, unreadOnly = false }) {
    const where = {};
    const orConditions = [];

    if (tenantId) {
      orConditions.push({ tenantId });
    }
    if (userEmail) {
      orConditions.push({ userEmail: userEmail.toLowerCase().trim() });
    }
    if (userId) {
      orConditions.push({ userId });
    }

    if (orConditions.length === 1) {
      Object.assign(where, orConditions[0]);
    } else if (orConditions.length > 1) {
      where.OR = orConditions;
    }

    if (unreadOnly) {
      where.isRead = false;
    }

    const [rawNotifications, unreadCount] = await Promise.all([
      prisma.inAppNotification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: parseInt(limit) || 20,
      }),
      prisma.inAppNotification.count({
        where: { ...where, isRead: false },
      }),
    ]);

    // Intelligently resolve optimal interactive action links
    const notifications = rawNotifications.map(n => {
      let resolvedLink = n.link;
      const meta = n.metadata || {};

      if (n.type === "CHAT_MESSAGE") {
        const threadId = meta.threadId || (n.link && n.link.includes("threadId=") ? new URLSearchParams(n.link.split("?")[1]).get("threadId") : null);
        const bookingId = meta.bookingId || (threadId && threadId.startsWith("booking_") ? threadId.replace("booking_", "") : null);

        if (tenantId) {
          // If viewing from business dashboard context, open in Owner Messages Hub
          resolvedLink = `/dashboard/chat` + (threadId ? `?threadId=${encodeURIComponent(threadId)}` : "");
        } else if (bookingId) {
          // If viewing from customer context, auto-open booking consultation chat modal
          resolvedLink = `/my-bookings?openChat=${encodeURIComponent(bookingId)}`;
        } else if (meta.tenantSlug) {
          resolvedLink = `/business/${meta.tenantSlug}?openChat=true`;
        }
      } else if (n.type === "STAFF_APPLICATION" && tenantId) {
        resolvedLink = `/dashboard/staff?tab=applications`;
      } else if ((n.type === "BOOKING_CONFIRMED" || n.type === "BOOKING_CANCELLED") && !tenantId && meta.bookingId) {
        resolvedLink = `/my-bookings?highlightBooking=${encodeURIComponent(meta.bookingId)}`;
      }

      return {
        ...n,
        link: resolvedLink || n.link || "#",
      };
    });

    return { notifications, unreadCount };
  }

  async markAsRead(id, context = {}) {
    return prisma.inAppNotification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllAsRead({ tenantId, userEmail, userId } = {}) {
    const where = { isRead: false };
    const orConditions = [];

    if (tenantId) orConditions.push({ tenantId });
    if (userEmail) orConditions.push({ userEmail: userEmail.toLowerCase().trim() });
    if (userId) orConditions.push({ userId });

    if (orConditions.length === 1) {
      Object.assign(where, orConditions[0]);
    } else if (orConditions.length > 1) {
      where.OR = orConditions;
    }

    return prisma.inAppNotification.updateMany({
      where,
      data: { isRead: true, readAt: new Date() },
    });
  }

  async deleteInApp(id) {
    return prisma.inAppNotification.delete({ where: { id } }).catch(() => {});
  }

  // ─── Multi-Profile High-Level Event Notifiers ──────────────────────────────

  /**
   * Dispatches notifications for a newly confirmed booking:
   * 1. Customer: Email receipt + in-app notification + SMS
   * 2. Business Owner: In-app notification + email alert + Socket.IO toast
   * 3. Assigned Staff Member: Schedule assignment alert (Email + SMS)
   */
  async notifyBookingConfirmed(bookingId) {
    if (!bookingId) return;
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { service: true, staff: true, tenant: true },
    });
    if (!booking) return;

    const serviceName = booking.service?.name || "Appointment";
    const tenantName = booking.tenant?.name || "Our Salon";
    const staffName = booking.staff?.name || "Specialist";
    const formattedTime = booking.startTime ? formatDateTime12(booking.startTime) : "Scheduled time";

    // 1. Customer Notifications
    await this.sendBookingConfirmation(bookingId).catch(() => {});

    if (booking.customerPhone) {
      await this.sendSMS({
        to: booking.customerPhone,
        message: `Your booking for ${serviceName} at ${tenantName} on ${formattedTime} is confirmed!`,
        tenantId: booking.tenantId,
        bookingId: booking.id,
        type: "SMS_CONFIRMATION",
      }).catch(() => {});
    }

    await this.createInApp({
      userEmail: booking.customerEmail,
      role: "CUSTOMER",
      title: `Booking Confirmed: ${serviceName}`,
      message: `Your appointment is confirmed for ${formattedTime} at ${tenantName}. Specialist: ${staffName}.`,
      type: "BOOKING_CONFIRMED",
      link: "/my-bookings",
      metadata: { bookingId: booking.id, amount: booking.price, serviceName },
    });

    // 2. Business Owner Notifications
    await this.createInApp({
      tenantId: booking.tenantId,
      role: "OWNER",
      title: "New Appointment Booked!",
      message: `${booking.customerName} booked ${serviceName} for ${formattedTime} (₹${booking.price}). Specialist: ${staffName}.`,
      type: "BOOKING_CONFIRMED",
      link: `/dashboard/bookings/${booking.id}`,
      metadata: { bookingId: booking.id, customerName: booking.customerName, price: booking.price },
    });

    if (booking.tenant?.email) {
      const ownerHtml = `
        <div style="font-family:sans-serif;max-width:500px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:8px">
          <h2 style="color:#059669;margin-top:0">New Appointment Booked!</h2>
          <p>Hello <strong>${booking.tenant.name}</strong>,</p>
          <p>A new appointment has been confirmed and paid online:</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:8px;color:#6b7280">Customer</td><td style="padding:8px;font-weight:600">${booking.customerName} (${booking.customerEmail})</td></tr>
            <tr style="background:#f9fafb"><td style="padding:8px;color:#6b7280">Service</td><td style="padding:8px;font-weight:600">${booking.service.name}</td></tr>
            <tr><td style="padding:8px;color:#6b7280">Date & Time</td><td style="padding:8px;font-weight:600">${formatDateTime12(booking.startTime)}</td></tr>
            <tr style="background:#f9fafb"><td style="padding:8px;color:#6b7280">Assigned Staff</td><td style="padding:8px;font-weight:600">${booking.staff ? booking.staff.name : "Any Specialist"}</td></tr>
            <tr><td style="padding:8px;color:#6b7280">Amount Paid</td><td style="padding:8px;font-weight:600">₹${booking.price}</td></tr>
          </table>
          <p style="margin-top:20px">
            <a href="/dashboard/bookings/${booking.id}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Open in Dashboard</a>
          </p>
        </div>
      `;
      await this._send({
        to: booking.tenant.email,
        subject: `New Booking Confirmed: ${booking.service.name} — ${booking.customerName}`,
        html: ownerHtml,
        tenantId: booking.tenantId,
        bookingId: booking.id,
        type: "OWNER_BOOKING_ALERT",
      }).catch(() => {});
    }

    // 3. Assigned Staff Member Alert
    if (booking.staff && booking.staff.email) {
      const staffHtml = `
        <div style="font-family:sans-serif;max-width:500px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:8px">
          <h2 style="color:#2563eb;margin-top:0">New Appointment Assigned to You</h2>
          <p>Hello <strong>${booking.staff.name}</strong>,</p>
          <p>You have a new client appointment booked at ${booking.tenant.name}:</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:8px;color:#6b7280">Client</td><td style="padding:8px;font-weight:600">${booking.customerName}</td></tr>
            <tr style="background:#f9fafb"><td style="padding:8px;color:#6b7280">Service</td><td style="padding:8px;font-weight:600">${booking.service.name}</td></tr>
            <tr><td style="padding:8px;color:#6b7280">Date & Time</td><td style="padding:8px;font-weight:600">${formatDateTime12(booking.startTime)}</td></tr>
          </table>
        </div>
      `;
      await this._send({
        to: booking.staff.email,
        subject: `New Appointment Assigned: ${booking.service.name} on ${formatDateTime12(booking.startTime)}`,
        html: staffHtml,
        tenantId: booking.tenantId,
        bookingId: booking.id,
        type: "STAFF_APPOINTMENT_ASSIGNED",
      }).catch(() => {});

      if (booking.staff.phone) {
        await this.sendSMS({
          to: booking.staff.phone,
          message: `Hello ${booking.staff.name}, you have a new appointment for ${booking.service.name} with ${booking.customerName} on ${formatDateTime12(booking.startTime)}.`,
          tenantId: booking.tenantId,
          bookingId: booking.id,
          type: "STAFF_SMS_ASSIGNED",
        }).catch(() => {});
      }
    }
  }

  /**
   * Dispatches notifications when an appointment is cancelled:
   * 1. Customer cancellation notice (email + in-app)
   * 2. Owner alert of freed slot (email + in-app)
   * 3. Staff alert of schedule change (email)
   */
  async notifyBookingCancelled(bookingId, reason) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { service: true, staff: true, tenant: true },
    });
    if (!booking) return;

    // 1. Customer notification
    await this.sendCancellationNotice(bookingId);

    await this.createInApp({
      userEmail: booking.customerEmail,
      role: "CUSTOMER",
      title: `Booking Cancelled: ${booking.service.name}`,
      message: `Your appointment for ${booking.service.name} on ${formatDateTime12(booking.startTime)} has been cancelled.${reason ? ` Reason: ${reason}` : ""}`,
      type: "BOOKING_CANCELLED",
      link: "/my-bookings",
      metadata: { bookingId: booking.id },
    });

    // 2. Owner notification
    await this.createInApp({
      tenantId: booking.tenantId,
      role: "OWNER",
      title: "Booking Cancelled",
      message: `${booking.customerName}'s appointment for ${booking.service.name} on ${formatDateTime12(booking.startTime)} was cancelled.${reason ? ` Reason: ${reason}` : ""}`,
      type: "BOOKING_CANCELLED",
      link: `/dashboard/bookings/${booking.id}`,
      metadata: { bookingId: booking.id, reason },
    });

    if (booking.tenant?.email) {
      const ownerCancelHtml = `
        <div style="font-family:sans-serif;max-width:500px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:8px">
          <h2 style="color:#dc2626;margin-top:0">Booking Cancelled</h2>
          <p>Hello <strong>${booking.tenant.name}</strong>,</p>
          <p>The following appointment has been cancelled and the slot is now freed:</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:8px;color:#6b7280">Customer</td><td style="padding:8px;font-weight:600">${booking.customerName}</td></tr>
            <tr style="background:#f9fafb"><td style="padding:8px;color:#6b7280">Service</td><td style="padding:8px;font-weight:600">${booking.service.name}</td></tr>
            <tr><td style="padding:8px;color:#6b7280">Date & Time</td><td style="padding:8px;font-weight:600">${formatDateTime12(booking.startTime)}</td></tr>
            ${reason ? `<tr style="background:#f9fafb"><td style="padding:8px;color:#6b7280">Reason</td><td style="padding:8px;font-weight:600">${reason}</td></tr>` : ""}
          </table>
        </div>
      `;
      await this._send({
        to: booking.tenant.email,
        subject: `Booking Cancelled: ${booking.service.name} — ${booking.customerName}`,
        html: ownerCancelHtml,
        tenantId: booking.tenantId,
        bookingId: booking.id,
        type: "OWNER_BOOKING_CANCELLED",
      }).catch(() => {});
    }

    // 3. Staff alert
    if (booking.staff?.email) {
      await this._send({
        to: booking.staff.email,
        subject: `Slot Freed: ${booking.service.name} on ${formatDateTime12(booking.startTime)} Cancelled`,
        html: `<p>Hello ${booking.staff.name}, your appointment with ${booking.customerName} on ${formatDateTime12(booking.startTime)} has been cancelled.</p>`,
        tenantId: booking.tenantId,
        bookingId: booking.id,
        type: "STAFF_APPOINTMENT_CANCELLED",
      }).catch(() => {});
    }
  }

  /**
   * Dispatches notifications when a job applicant submits a staff application
   */
  async notifyStaffApplicationReceived(applicationId) {
    if (!applicationId || !isLikelyUuid(applicationId)) return;
    let app = null;
    try {
      app = await prisma.staffApplication.findUnique({
        where: { id: applicationId },
        include: { tenant: true },
      });
    } catch {
      return;
    }
    if (!app) return;

    // 1. Owner In-App Alert
    await this.createInApp({
      tenantId: app.tenantId,
      role: "OWNER",
      title: `New Staff Application: ${app.applicantName}`,
      message: `${app.applicantName} applied for ${app.roleTitle}. Experience: ${app.experience || "Not specified"}. Review in Staff Hub.`,
      type: "STAFF_APPLICATION",
      link: "/dashboard/staff?tab=applications",
      metadata: { applicationId: app.id, roleTitle: app.roleTitle },
    });

    // 2. Owner Email Alert
    if (app.tenant?.email) {
      const ownerAppHtml = `
        <div style="font-family:sans-serif;max-width:500px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:8px">
          <h2 style="color:#2563eb;margin-top:0">New Staff Job Application</h2>
          <p>Hello <strong>${app.tenant.name}</strong>,</p>
          <p>A candidate has applied to join your team:</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0">
            <tr><td style="padding:8px;color:#6b7280">Applicant Name</td><td style="padding:8px;font-weight:600">${app.applicantName}</td></tr>
            <tr style="background:#f9fafb"><td style="padding:8px;color:#6b7280">Role Applying For</td><td style="padding:8px;font-weight:600">${app.roleTitle}</td></tr>
            <tr><td style="padding:8px;color:#6b7280">Email & Phone</td><td style="padding:8px;font-weight:600">${app.email} ${app.phone ? `(${app.phone})` : ""}</td></tr>
            ${app.experience ? `<tr style="background:#f9fafb"><td style="padding:8px;color:#6b7280">Experience</td><td style="padding:8px;font-weight:600">${app.experience}</td></tr>` : ""}
          </table>
          <p><a href="/dashboard/staff?tab=applications" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Review Application in Hub</a></p>
        </div>
      `;
      await this._send({
        to: app.tenant.email,
        subject: `New Job Application: ${app.applicantName} (${app.roleTitle})`,
        html: ownerAppHtml,
        tenantId: app.tenantId,
        type: "OWNER_STAFF_APP_ALERT",
      }).catch(() => {});
    }

    // 3. Candidate Acknowledgment Email
    if (app.email) {
      const candidateHtml = `
        <div style="font-family:sans-serif;max-width:500px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:8px">
          <h2 style="color:#111827;margin-top:0">Application Received</h2>
          <p>Dear <strong>${app.applicantName}</strong>,</p>
          <p>Thank you for your interest in joining <strong>${app.tenant.name}</strong> as a <strong>${app.roleTitle}</strong>.</p>
          <p>We have received your application and the business owner will review your credentials shortly.</p>
          <p style="color:#6b7280;font-size:13px;margin-top:20px">— Team ${app.tenant.name}</p>
        </div>
      `;
      await this._send({
        to: app.email,
        subject: `Application Received — ${app.tenant.name}`,
        html: candidateHtml,
        tenantId: app.tenantId,
        type: "CANDIDATE_APP_CONFIRMATION",
      }).catch(() => {});
    }
  }

  /**
   * Dispatches notifications when an owner accepts or declines a staff candidate
   */
  async notifyStaffApplicationDecision(applicationId, status, notes) {
    if (!applicationId || !isLikelyUuid(applicationId)) return;
    let app = null;
    try {
      app = await prisma.staffApplication.findUnique({
        where: { id: applicationId },
        include: { tenant: true },
      });
    } catch {
      return;
    }
    if (!app || !app.email) return;

    if (status === "ACCEPTED") {
      const hireHtml = `
        <div style="font-family:sans-serif;max-width:500px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:8px">
          <h2 style="color:#059669;margin-top:0">Congratulations! Your Application was Accepted</h2>
          <p>Dear <strong>${app.applicantName}</strong>,</p>
          <p>We are delighted to inform you that your application for the <strong>${app.roleTitle}</strong> role at <strong>${app.tenant.name}</strong> has been accepted!</p>
          ${notes ? `<p style="padding:12px;background:#f3f4f6;border-radius:6px;font-style:italic">"${notes}"</p>` : ""}
          <p>Welcome to our team! We will be in touch with your onboarding schedule.</p>
          <p style="color:#6b7280;font-size:13px;margin-top:20px">— Team ${app.tenant.name}</p>
        </div>
      `;
      await this._send({
        to: app.email,
        subject: `Congratulations! Welcome to ${app.tenant.name}`,
        html: hireHtml,
        tenantId: app.tenantId,
        type: "CANDIDATE_HIRED_OFFER",
      }).catch(() => {});
    } else if (status === "REJECTED") {
      const declineHtml = `
        <div style="font-family:sans-serif;max-width:500px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:8px">
          <h2 style="color:#111827;margin-top:0">Update on Your Application</h2>
          <p>Dear <strong>${app.applicantName}</strong>,</p>
          <p>Thank you for taking the time to apply for the <strong>${app.roleTitle}</strong> role at <strong>${app.tenant.name}</strong>.</p>
          <p>After careful review, we have decided to move forward with other candidates at this time. We appreciate your interest and wish you the best in your career search.</p>
          <p style="color:#6b7280;font-size:13px;margin-top:20px">— Team ${app.tenant.name}</p>
        </div>
      `;
      await this._send({
        to: app.email,
        subject: `Update regarding your application to ${app.tenant.name}`,
        html: declineHtml,
        tenantId: app.tenantId,
        type: "CANDIDATE_REJECTED",
      }).catch(() => {});
    }
  }

  /**
   * Dispatches in-app notification when a chat message is sent
   */
  async notifyChatMessage({ tenantId, senderType, senderName, senderEmail, recipientEmail, message, threadId }) {
    let bookingId = null;
    if (threadId && threadId.startsWith("booking_")) {
      bookingId = threadId.replace("booking_", "");
    }

    let tenantSlug = null;
    let isRecipientOwner = false;

    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (tenantId && UUID_REGEX.test(tenantId)) {
      try {
        const tenant = await prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { id: true, slug: true, email: true },
        });
        if (tenant) {
          tenantSlug = tenant.slug;
          if (recipientEmail && tenant.email && recipientEmail.toLowerCase().trim() === tenant.email.toLowerCase().trim()) {
            isRecipientOwner = true;
          }
        }
      } catch (err) {
        console.warn("Tenant lookup warning in notifyChatMessage:", err.message);
      }
    }

    if (senderType === "CUSTOMER" || senderType === "VISITOR" || isRecipientOwner) {
      // Alert Owner -> Route to Owner Messages Hub with thread pre-selected
      await this.createInApp({
        tenantId,
        role: "OWNER",
        title: `New Message from ${senderName}`,
        message: message.length > 80 ? message.slice(0, 80) + "..." : message,
        type: "CHAT_MESSAGE",
        link: `/dashboard/chat?threadId=${encodeURIComponent(threadId)}`,
        userEmail: recipientEmail,
        metadata: { threadId, bookingId, senderType, senderName, tenantSlug },
      });
    } else {
      // Alert Customer -> Route to My Bookings with consultation chat modal auto-opened
      const customerLink = bookingId
        ? `/my-bookings?openChat=${encodeURIComponent(bookingId)}`
        : (tenantSlug ? `/business/${tenantSlug}?openChat=true` : `/my-bookings`);

      await this.createInApp({
        tenantId,
        role: "CUSTOMER",
        title: `New Reply from ${senderName}`,
        message: message.length > 80 ? message.slice(0, 80) + "..." : message,
        type: "CHAT_MESSAGE",
        link: customerLink,
        userEmail: recipientEmail,
        metadata: { threadId, bookingId, senderType, senderName, tenantSlug },
      });
    }
  }

  // ─── Direct Email & SMS Senders ──────────────────────────────────────────

  async sendBookingConfirmation(bookingId) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { service: true, staff: true, tenant: true },
    });
    if (!booking) return;

    const html = `
      <div style="font-family:sans-serif;max-width:500px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:8px">
        <h2 style="color:#111827">Booking Confirmed!</h2>
        <p>Dear ${booking.customerName},</p>
        <p>Your appointment has been confirmed at <strong>${booking.tenant ? booking.tenant.name : "our salon"}</strong>:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px;color:#6b7280">Service</td><td style="padding:8px;font-weight:600">${booking.service.name}</td></tr>
          <tr style="background:#f9fafb"><td style="padding:8px;color:#6b7280">Date & Time</td><td style="padding:8px;font-weight:600">${formatDateTime12(booking.startTime)}</td></tr>
          ${booking.staff ? `<tr><td style="padding:8px;color:#6b7280">Specialist</td><td style="padding:8px;font-weight:600">${booking.staff.name}</td></tr>` : ""}
          <tr style="background:#f9fafb"><td style="padding:8px;color:#6b7280">Amount Paid</td><td style="padding:8px;font-weight:600">₹${booking.price}</td></tr>
        </table>
        <p style="color:#6b7280;font-size:14px">Thank you for booking with us! You can view and manage your appointments anytime in My Bookings.</p>
      </div>
    `;

    await this._send({
      to: booking.customerEmail,
      subject: `Booking Confirmed — ${booking.service.name}`,
      html,
      tenantId: booking.tenantId,
      bookingId: booking.id,
      type: "CONFIRMATION",
    });
  }

  async sendBookingReminder(bookingId, hoursAhead) {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { service: true } });
    if (!booking || booking.status !== "CONFIRMED") return;

    const html = `
      <div style="font-family:sans-serif;max-width:500px;margin:auto;padding:24px">
        <h2>Appointment Reminder</h2>
        <p>Dear ${booking.customerName},</p>
        <p>Your <strong>${booking.service.name}</strong> appointment is in ${hoursAhead} hour(s).</p>
        <p><strong>Date & Time:</strong> ${formatDateTime12(booking.startTime)}</p>
      </div>
    `;

    await this._send({
      to: booking.customerEmail,
      subject: `Reminder: Your appointment in ${hoursAhead}h`,
      html,
      tenantId: booking.tenantId,
      bookingId: booking.id,
      type: `REMINDER_${hoursAhead}H`,
    });
  }

  async sendCancellationNotice(bookingId) {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { service: true } });
    if (!booking) return;

    const html = `
      <div style="font-family:sans-serif;max-width:500px;margin:auto;padding:24px">
        <h2>Booking Cancelled</h2>
        <p>Dear ${booking.customerName},</p>
        <p>Your <strong>${booking.service.name}</strong> appointment on ${formatDateTime12(booking.startTime)} has been cancelled.</p>
        ${booking.cancellationReason ? `<p><strong>Reason:</strong> ${booking.cancellationReason}</p>` : ""}
      </div>
    `;

    await this._send({
      to: booking.customerEmail,
      subject: `Booking Cancelled — ${booking.service.name}`,
      html,
      tenantId: booking.tenantId,
      bookingId: booking.id,
      type: "CANCELLATION",
    });
  }

  async checkAndSendDueReminders() {
    const now = new Date();

    // 24 Hour Reminders (23h to 25h ahead)
    const in23h = new Date(now.getTime() + 23 * 3600 * 1000);
    const in25h = new Date(now.getTime() + 25 * 3600 * 1000);

    const due24h = await prisma.booking.findMany({
      where: {
        status: "CONFIRMED",
        startTime: { gte: in23h, lte: in25h },
      },
      select: { id: true },
    });

    for (const b of due24h) {
      const alreadySent = await prisma.notificationLog.findFirst({
        where: { bookingId: b.id, type: "REMINDER_24H", status: "SENT" },
      });
      if (!alreadySent) {
        await this.sendBookingReminder(b.id, 24);
      }
    }

    // 1 Hour Reminders (45m to 75m ahead)
    const in45m = new Date(now.getTime() + 45 * 60 * 1000);
    const in75m = new Date(now.getTime() + 75 * 60 * 1000);

    const due1h = await prisma.booking.findMany({
      where: {
        status: "CONFIRMED",
        startTime: { gte: in45m, lte: in75m },
      },
      select: { id: true },
    });

    for (const b of due1h) {
      const alreadySent = await prisma.notificationLog.findFirst({
        where: { bookingId: b.id, type: "REMINDER_1H", status: "SENT" },
      });
      if (!alreadySent) {
        await this.sendBookingReminder(b.id, 1);
      }
    }
  }

  async sendSMS({ to, message, tenantId, bookingId, type }) {
    if (!to) return;
    const log = await prisma.notificationLog.create({
      data: { tenantId, bookingId: bookingId || null, channel: "SMS", recipient: to, type, status: "PENDING" },
    });

    try {
      if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_SENDER_PHONE) {
        const twilio = require("twilio")(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        await twilio.messages.create({
          body: message,
          from: process.env.TWILIO_SENDER_PHONE,
          to,
        });
      } else {
        console.log(`[DEV SMS] to: ${to} | ${message}`);
      }
      await prisma.notificationLog.update({
        where: { id: log.id },
        data: { status: "SENT", sentAt: new Date(), attempts: 1 },
      });
    } catch (err) {
      await prisma.notificationLog.update({
        where: { id: log.id },
        data: { status: "FAILED", errorMessage: err.message, attempts: { increment: 1 } },
      });
      console.error(`✗ SMS failed to ${to}:`, err.message);
    }
  }

  async _send({ to, subject, html, tenantId, bookingId, type }) {
    const log = await prisma.notificationLog.create({
      data: { tenantId, bookingId: bookingId || null, channel: "EMAIL", recipient: to, type, status: "PENDING" },
    });

    try {
      await this.transporter.sendMail({
        from: process.env.EMAIL_FROM || "noreply@bookingapp.local",
        to, subject, html,
      });
      await prisma.notificationLog.update({
        where: { id: log.id },
        data: { status: "SENT", sentAt: new Date(), attempts: 1 },
      });
      console.log(`✓ Email sent to ${to}: ${type}`);
    } catch (err) {
      await prisma.notificationLog.update({
        where: { id: log.id },
        data: { status: "FAILED", errorMessage: err.message, attempts: { increment: 1 } },
      });
      console.error(`✗ Email failed to ${to}:`, err.message);
    }
  }
}

module.exports = new NotificationsService();
