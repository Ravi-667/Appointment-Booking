require("dotenv").config();
const prisma = require("../../src/utils/prisma.client");
const auditService = require("../../src/services/audit.service");

describe("AuditService Unit Tests", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should write audit log entries with JSON old and new values", async () => {
    const createSpy = jest.spyOn(prisma.auditLog, "create").mockResolvedValue({
      id: "audit-1",
      action: "BOOKING_CANCELLED",
    });

    const res = await auditService.record({
      tenantId: "t1",
      userId: "u1",
      action: "BOOKING_CANCELLED",
      entityType: "Booking",
      entityId: "b1",
      oldValues: { status: "CONFIRMED" },
      newValues: { status: "CANCELLED", reason: "Customer requested" },
      ipAddress: "127.0.0.1",
    });

    expect(createSpy).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: "t1",
        userId: "u1",
        action: "BOOKING_CANCELLED",
        entityType: "Booking",
        entityId: "b1",
        ipAddress: "127.0.0.1",
      }),
    });
    expect(res).toHaveProperty("id", "audit-1");
  });

  it("should paginate audit logs in getLogs", async () => {
    jest.spyOn(prisma.auditLog, "findMany").mockResolvedValue([{ id: "a1" }, { id: "a2" }]);
    jest.spyOn(prisma.auditLog, "count").mockResolvedValue(25);

    const result = await auditService.getLogs("t1", { page: 1, limit: 10 });

    expect(result.total).toBe(25);
    expect(result.page).toBe(1);
    expect(result.pages).toBe(3);
    expect(result.logs.length).toBe(2);
  });
});
