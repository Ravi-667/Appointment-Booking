const { subDays, startOfDay, endOfDay } = require("date-fns");
const prisma = require("../utils/prisma.client");

class DashboardService {
  async getStats(tenantId, period = "30d") {
    const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
    const from = subDays(new Date(), days);

    const [total, confirmed, cancelled, noShow, revenue] = await Promise.all([
      prisma.booking.count({ where: { tenantId, createdAt: { gte: from } } }),
      prisma.booking.count({ where: { tenantId, status: "CONFIRMED", createdAt: { gte: from } } }),
      prisma.booking.count({ where: { tenantId, status: "CANCELLED", createdAt: { gte: from } } }),
      prisma.booking.count({ where: { tenantId, status: "NO_SHOW", createdAt: { gte: from } } }),
      prisma.payment.aggregate({ _sum: { amount: true }, where: { tenantId, status: "CAPTURED", createdAt: { gte: from } } }),
    ]);

    return {
      period,
      total,
      confirmed,
      cancelled,
      noShow,
      cancellationRate: total > 0 ? ((cancelled / total) * 100).toFixed(1) : "0",
      revenue: revenue._sum.amount || 0,
    };
  }

  async getCalendar(tenantId, date) {
    const day = new Date(date);
    return prisma.booking.findMany({
      where: {
        tenantId,
        startTime: { gte: startOfDay(day), lte: endOfDay(day) },
        status: { in: ["CONFIRMED", "PENDING_PAYMENT"] },
      },
      include: { service: true, staff: true },
      orderBy: { startTime: "asc" },
    });
  }

  async getUpcoming(tenantId, limit = 10) {
    return prisma.booking.findMany({
      where: { tenantId, status: "CONFIRMED", startTime: { gte: new Date() } },
      include: { service: true, staff: true },
      orderBy: { startTime: "asc" },
      take: parseInt(limit),
    });
  }

  async getNotificationLogs(tenantId, page = 1, limit = 20) {
    const where = { tenantId };
    const [logs, total] = await Promise.all([
      prisma.notificationLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: parseInt(limit) }),
      prisma.notificationLog.count({ where }),
    ]);
    return { logs, total, page, limit, pages: Math.ceil(total / limit) };
  }
}

module.exports = new DashboardService();

