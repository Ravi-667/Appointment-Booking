const nodemailer = require("nodemailer");
const prisma = require("../utils/prisma.client");

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
          <tr style="background:#f9fafb"><td style="padding:8px;color:#6b7280">Date & Time</td><td style="padding:8px;font-weight:600">${new Date(booking.startTime).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td></tr>
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
        <p><strong>Date & Time:</strong> ${new Date(booking.startTime).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p>
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
        <p>Your <strong>${booking.service.name}</strong> appointment on ${new Date(booking.startTime).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} has been cancelled.</p>
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

