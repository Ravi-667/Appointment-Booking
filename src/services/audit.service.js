const prisma = require("../utils/prisma.client");

class AuditService {
  async record({ tenantId, userId, action, entityType, entityId, oldValues, newValues, ipAddress }) {
    try {
      return await prisma.auditLog.create({
        data: {
          tenantId: tenantId || null,
          userId: userId || null,
          action,
          entityType: entityType || null,
          entityId: entityId || null,
          oldValues: oldValues ? JSON.parse(JSON.stringify(oldValues)) : undefined,
          newValues: newValues ? JSON.parse(JSON.stringify(newValues)) : undefined,
          ipAddress: ipAddress || null,
        },
      });
    } catch (err) {
      // Audit log failures must never break the main request flow
      console.warn("Audit log recording failed:", err.message);
      return null;
    }
  }

  async getLogs(tenantId, { page = 1, limit = 20 } = {}) {
    const where = tenantId ? { tenantId } : {};
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: parseInt(limit),
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      logs,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / limit),
    };
  }
}

module.exports = new AuditService();
