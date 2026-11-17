require("dotenv").config();
const prisma = require("../../src/utils/prisma.client");
const notificationsService = require("../../src/services/notifications.service");

describe("NotificationsService - Automated Reminders", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should query confirmed bookings and send reminder if not already sent", async () => {
    const mockBookings = [{ id: "b123" }];

    // Mock Prisma findMany for 24h & 1h queries
    jest.spyOn(prisma.booking, "findMany").mockResolvedValue(mockBookings);
    jest.spyOn(prisma.notificationLog, "findFirst").mockResolvedValue(null); // Not sent yet

    const sendReminderSpy = jest
      .spyOn(notificationsService, "sendBookingReminder")
      .mockResolvedValue();

    await notificationsService.checkAndSendDueReminders();

    expect(sendReminderSpy).toHaveBeenCalledWith("b123", 24);
    expect(sendReminderSpy).toHaveBeenCalledWith("b123", 1);
  });

  it("should skip sending reminder if already logged as SENT", async () => {
    const mockBookings = [{ id: "b123" }];

    jest.spyOn(prisma.booking, "findMany").mockResolvedValue(mockBookings);
    jest.spyOn(prisma.notificationLog, "findFirst").mockResolvedValue({ id: "log-1", status: "SENT" });

    const sendReminderSpy = jest
      .spyOn(notificationsService, "sendBookingReminder")
      .mockResolvedValue();

    await notificationsService.checkAndSendDueReminders();

    expect(sendReminderSpy).not.toHaveBeenCalled();
  });
});
