const nodemailer = require("nodemailer");
const prisma = require("../utils/prisma.client");
const { formatDateTime12 } = require("../utils/datetime.utils");

class NotificationsService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "localhost",
      port: parseInt(process.env.SMTP_PORT || "1025"),
      secure: false,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }

  async sendBookingConfirmation(bookingId) {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { service: true, staff: true },
    });
    if (!booking) return;

    const html = `
      <div style="font-family:sans-serif;max-width:500px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:8px">
        <h2 style="color:#111827">Booking Confirmed!</h2>
        <p>Dear ${booking.customerName},</p>
        <p>Your appointment has been confirmed:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:8px;color:#6b7280">Service</td><td style="padding:8px;font-weight:600">${booking.service.name}</td></tr>
          <tr style="background:#f9fafb"><td style="padding:8px;color:#6b7280">Date & Time</td><td style="padding:8px;font-weight:600">${formatDateTime12(booking.startTime)}</td></tr>
          ${booking.staff ? `<tr><td style="padding:8px;color:#6b7280">Staff</td><td style="padding:8px;font-weight:600">${booking.staff.name}</td></tr>` : ""}
          <tr style="background:#f9fafb"><td style="padding:8px;color:#6b7280">Amount Paid</td><td style="padding:8px;font-weight:600">₹${booking.depositAmount}</td></tr>
        </table>
        <p style="color:#6b7280;font-size:14px">Thank you for booking with us!</p>
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

