require("dotenv").config();
const prisma = require("../../src/utils/prisma.client");
const notificationsService = require("../../src/services/notifications.service");

describe("SMS Notification Service", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should record notification log with channel SMS and update to SENT", async () => {
    jest.spyOn(prisma.notificationLog, "create").mockResolvedValue({ id: "sms-log-1" });
    const updateSpy = jest.spyOn(prisma.notificationLog, "update").mockResolvedValue({});

    await notificationsService.sendSMS({
      to: "+919876543210",
      message: "Your appointment is confirmed!",
      tenantId: "tenant-123",
      bookingId: "booking-456",
      type: "SMS_CONFIRMATION",
    });

    expect(prisma.notificationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        channel: "SMS",
        recipient: "+919876543210",
        type: "SMS_CONFIRMATION",
        status: "PENDING",
      }),
    });

    expect(updateSpy).toHaveBeenCalledWith({
      where: { id: "sms-log-1" },
      data: expect.objectContaining({
        status: "SENT",
        attempts: 1,
      }),
    });
  });
});
