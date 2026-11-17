const crypto = require("crypto");
const { addMinutes } = require("date-fns");
const prisma = require("../utils/prisma.client");
const redis = require("../utils/redis.client");
const kafka = require("../utils/kafka.client");
const auditService = require("./audit.service");

function makeError(msg, status) { const e = new Error(msg); e.status = status; return e; }

const HOLD_TTL = 600;

class BookingsService {
  async holdSlot({ tenantId, serviceId, staffId, startTime, customerName, customerEmail, customerPhone }) {
    const service = await prisma.service.findFirstOrThrow({
      where: { id: serviceId, tenantId, isActive: true },
    });

    const start = new Date(startTime);
    const end = addMinutes(start, service.durationMinutes);
    const sessionToken = crypto.randomBytes(32).toString("hex");

    const lockKey = `hold:${tenantId}:${staffId || "any"}:${start.toISOString()}`;
    const result = await redis.set(lockKey, sessionToken, "EX", HOLD_TTL, "NX");

    if (!result) throw makeError("This slot was just taken. Please choose another time.", 409);

    const hold = await prisma.bookingHold.create({
      data: { tenantId, serviceId, staffId: staffId || null, startTime: start, endTime: end, sessionToken, expiresAt: new Date(Date.now() + HOLD_TTL * 1000) },
    });

    return {
      holdId: hold.id,
      sessionToken,
      expiresAt: hold.expiresAt,
      slot: { startTime: start.toISOString(), endTime: end.toISOString() },
      service: { name: service.name, price: service.price, depositAmount: service.depositAmount },
    };
  }

  async createBooking(holdId, sessionToken, customerInfo) {
    const hold = await prisma.bookingHold.findUnique({ where: { id: holdId } });
    if (!hold) throw makeError("Hold not found or expired", 404);
    if (hold.sessionToken !== sessionToken) throw makeError("Invalid session token", 400);
    if (hold.expiresAt < new Date()) throw makeError("Hold expired. Please start over.", 400);

    const service = await prisma.service.findUniqueOrThrow({ where: { id: hold.serviceId } });

    try {
      const booking = await prisma.$transaction(async (tx) => {
        const b = await tx.booking.create({
          data: {
            tenantId: hold.tenantId, serviceId: hold.serviceId,
            staffId: hold.staffId, startTime: hold.startTime, endTime: hold.endTime,
            status: "PENDING_PAYMENT", price: service.price, depositAmount: service.depositAmount,
            customerName: customerInfo?.customerName || "Guest",
            customerEmail: customerInfo?.customerEmail || "guest@placeholder.com",
            customerPhone: customerInfo?.customerPhone || null,
            customerNotes: customerInfo?.notes || null,
          },
        });
        await tx.bookingHold.delete({ where: { id: hold.id } });
        return b;
      });

      await redis.del(`hold:${hold.tenantId}:${hold.staffId || "any"}:${hold.startTime.toISOString()}`);
      return booking;
    } catch (err) {
      if (err.message?.includes("no_double_booking")) {
        throw makeError("Slot just booked by someone else. Please choose another time.", 409);
      }
      throw err;
    }
  }

  async confirmBooking(bookingId, tenantId) {
    return prisma.booking.update({
      where: { id: bookingId },
      data: { status: "CONFIRMED" },
      include: { service: true, staff: true },
    });
  }

  async cancelBooking(tenantId, bookingId, reason) {
    const booking = await prisma.booking.findFirst({ where: { id: bookingId, tenantId } });
    if (!booking) throw makeError("Booking not found", 404);
    if (!["CONFIRMED", "PENDING_PAYMENT"].includes(booking.status)) {
      throw makeError("Cannot cancel booking in its current status", 400);
    }
    await prisma.booking.update({ where: { id: bookingId }, data: { status: "CANCELLED", cancellationReason: reason } });
    await kafka.publish("booking.cancelled", { bookingId, tenantId, reason });
    await auditService.record({
      tenantId,
      action: "BOOKING_CANCELLED",
      entityType: "Booking",
      entityId: bookingId,
      newValues: { reason },
    });
    return { message: "Booking cancelled successfully" };
  }

  async markNoShow(tenantId, bookingId) {
    const booking = await prisma.booking.findFirst({ where: { id: bookingId, tenantId } });
    if (!booking) throw makeError("Booking not found", 404);
    if (booking.status !== "CONFIRMED") {
      throw makeError("Only CONFIRMED bookings can be marked as NO_SHOW", 400);
    }
    const updated = await prisma.booking.update({
      where: { id: bookingId },
      data: { status: "NO_SHOW" },
    });
    await auditService.record({
      tenantId,
      action: "BOOKING_NO_SHOW",
      entityType: "Booking",
      entityId: bookingId,
    });
    return updated;
  }

  async reschedule(tenantId, bookingId, newStartTime) {
    const booking = await prisma.booking.findFirst({ where: { id: bookingId, tenantId, status: "CONFIRMED" } });
    if (!booking) throw makeError("Booking not found or not confirmed", 404);

    const service = await prisma.service.findUniqueOrThrow({ where: { id: booking.serviceId } });
    const newStart = new Date(newStartTime);
    const newEnd = addMinutes(newStart, service.durationMinutes);

    const rescheduled = await prisma.$transaction(async (tx) => {
      await tx.booking.update({ where: { id: bookingId }, data: { status: "RESCHEDULED" } });
      return tx.booking.create({
        data: {
          tenantId: booking.tenantId, serviceId: booking.serviceId,
          staffId: booking.staffId, startTime: newStart, endTime: newEnd,
          status: "CONFIRMED", price: booking.price, depositAmount: booking.depositAmount,
          customerName: booking.customerName, customerEmail: booking.customerEmail,
          customerPhone: booking.customerPhone, rescheduledFromId: booking.id,
        },
      });
    });

    await auditService.record({
      tenantId,
      action: "BOOKING_RESCHEDULED",
      entityType: "Booking",
      entityId: rescheduled.id,
      oldValues: { bookingId, oldStartTime: booking.startTime },
      newValues: { newStartTime: rescheduled.startTime },
    });

    return rescheduled;
  }

  async getBookings(tenantId, { page = 1, limit = 20, status, from, to } = {}) {
    const where = { tenantId };
    if (status) where.status = status;
    if (from || to) {
      where.startTime = {};
      if (from) where.startTime.gte = new Date(from);
      if (to) where.startTime.lte = new Date(to);
    }
    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({ where, include: { service: true, staff: true }, orderBy: { startTime: "desc" }, skip: (page - 1) * limit, take: parseInt(limit) }),
      prisma.booking.count({ where }),
    ]);
    return { bookings, total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) };
  }

  async getOne(tenantId, bookingId) {
    const b = await prisma.booking.findFirst({ where: { id: bookingId, tenantId }, include: { service: true, staff: true, payments: true } });
    if (!b) throw makeError("Booking not found", 404);
    return b;
  }

  async cleanupExpiredHolds() {
    const deleted = await prisma.bookingHold.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    if (deleted.count > 0) console.log(`Cleaned up ${deleted.count} expired holds`);
  }
}

module.exports = new BookingsService();

