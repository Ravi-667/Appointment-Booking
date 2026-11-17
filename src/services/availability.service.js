const { addMinutes, isAfter, isBefore, addDays, addHours } = require("date-fns");
const { toZonedTime, fromZonedTime } = require("date-fns-tz");
const prisma = require("../utils/prisma.client");

class AvailabilityService {
  async getSlots(tenantId, serviceId, dateStr, staffId) {
    const tenant = await prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      include: { businessHours: true, holidays: { where: { date: new Date(dateStr) } } },
    });

    if (tenant.holidays.length > 0) return [];

    const zonedDate = toZonedTime(new Date(dateStr), tenant.timezone);
    const dayOfWeek = zonedDate.getDay();
    const hours = tenant.businessHours.find((h) => h.dayOfWeek === dayOfWeek);
    if (!hours || !hours.isOpen) return [];

    const service = await prisma.service.findFirstOrThrow({
      where: { id: serviceId, tenantId, isActive: true },
    });

    const staffList = staffId
      ? await prisma.staff.findMany({ where: { id: staffId, tenantId, isActive: true }, select: { id: true, name: true } })
      : await prisma.staff.findMany({
          where: { tenantId, isActive: true, staffServices: { some: { serviceId } } },
          select: { id: true, name: true },
        });

    if (staffList.length === 0) return [];

    const allSlots = [];
    for (const staff of staffList) {
      const slots = await this._slotsForStaff(staff, service, tenant, hours, dateStr);
      allSlots.push(...slots);
    }

    if (!staffId) {
      const seen = new Set();
      return allSlots.filter((s) => { if (seen.has(s.startTime)) return false; seen.add(s.startTime); return true; });
    }
    return allSlots;
  }

  async _slotsForStaff(staff, service, tenant, businessHours, dateStr) {
    const override = await prisma.staffSchedule.findUnique({
      where: { staffId_date: { staffId: staff.id, date: new Date(dateStr) } },
    });
    if (override?.isOff) return [];

    const openTime = override?.startTime || businessHours.openTime;
    const closeTime = override?.endTime || businessHours.closeTime;

    const [oh, om] = openTime.split(":").map(Number);
    const [ch, cm] = closeTime.split(":").map(Number);
    const zoned = toZonedTime(new Date(dateStr), tenant.timezone);

    const openZ = new Date(zoned); openZ.setHours(oh, om, 0, 0);
    const closeZ = new Date(zoned); closeZ.setHours(ch, cm, 0, 0);
    const openUtc = fromZonedTime(openZ, tenant.timezone);
    const closeUtc = fromZonedTime(closeZ, tenant.timezone);

    const [bookings, holds] = await Promise.all([
      prisma.booking.findMany({
        where: { staffId: staff.id, status: { in: ["CONFIRMED", "PENDING_PAYMENT"] }, startTime: { gte: openUtc, lt: closeUtc } },
        select: { startTime: true, endTime: true },
      }),
      prisma.bookingHold.findMany({
        where: { staffId: staff.id, expiresAt: { gte: new Date() }, startTime: { gte: openUtc, lt: closeUtc } },
        select: { startTime: true, endTime: true },
      }),
    ]);

    const blocked = [...bookings, ...holds];
    const slotDuration = service.durationMinutes + (tenant.bufferMinutes || 0);
    const now = new Date();
    const slots = [];
    let cur = new Date(openUtc);

    while (true) {
      const slotEnd = addMinutes(cur, service.durationMinutes);
      if (isAfter(slotEnd, closeUtc)) break;

      const tooSoon = isBefore(cur, addHours(now, tenant.bookingLeadTimeHours));
      const tooFar = isAfter(cur, addDays(now, tenant.bookingAdvanceLimitDays));

      if (!tooSoon && !tooFar) {
        const isBlocked = blocked.some(
          (b) => isBefore(cur, new Date(b.endTime)) && isAfter(slotEnd, new Date(b.startTime))
        );
        if (!isBlocked) {
          slots.push({ startTime: cur.toISOString(), endTime: slotEnd.toISOString(), staffId: staff.id, staffName: staff.name });
        }
      }
      cur = addMinutes(cur, slotDuration);
    }
    return slots;
  }
}

module.exports = new AvailabilityService();

