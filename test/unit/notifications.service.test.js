require("dotenv").config();
const prisma = require("../../src/utils/prisma.client");
const notificationsService = require("../../src/services/notifications.service");

describe("NotificationsService - Automated Reminders & Multi-Profile Hub", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("Automated Reminders", () => {
    it("should query confirmed bookings and send reminder if not already sent", async () => {
      const mockBookings = [{ id: "b123" }];

      jest.spyOn(prisma.booking, "findMany").mockResolvedValue(mockBookings);
      jest.spyOn(prisma.notificationLog, "findFirst").mockResolvedValue(null);

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

  describe("In-App Notifications", () => {
    it("should create in-app notification and emit to socket rooms", async () => {
      const mockNotif = {
        id: "notif-1",
        tenantId: "t-1",
        userEmail: "customer@gmail.com",
        role: "CUSTOMER",
        title: "Test Alert",
        message: "Your appointment is confirmed",
        type: "BOOKING_CONFIRMED",
        isRead: false,
      };

      const mockIo = {
        to: jest.fn().mockReturnThis(),
        emit: jest.fn(),
      };
      notificationsService.setIo(mockIo);

      jest.spyOn(prisma.inAppNotification, "create").mockResolvedValue(mockNotif);

      const result = await notificationsService.createInApp({
        tenantId: "t-1",
        userEmail: "customer@gmail.com",
        role: "CUSTOMER",
        title: "Test Alert",
        message: "Your appointment is confirmed",
        type: "BOOKING_CONFIRMED",
      });

      expect(result.id).toBe("notif-1");
      expect(mockIo.to).toHaveBeenCalledWith("tenant:t-1");
      expect(mockIo.to).toHaveBeenCalledWith("user:customer@gmail.com");
      expect(mockIo.emit).toHaveBeenCalledWith("notification:new", mockNotif);
    });

    it("should fetch in-app notifications and unread count", async () => {
      const mockList = [{ id: "n1", isRead: false }, { id: "n2", isRead: true }];
      jest.spyOn(prisma.inAppNotification, "findMany").mockResolvedValue(mockList);
      jest.spyOn(prisma.inAppNotification, "count").mockResolvedValue(1);

      const res = await notificationsService.getInAppNotifications({ tenantId: "t-1" });
      expect(res.notifications).toHaveLength(2);
      expect(res.unreadCount).toBe(1);
    });

    it("should mark single notification as read", async () => {
      jest.spyOn(prisma.inAppNotification, "update").mockResolvedValue({ id: "n1", isRead: true });

      const res = await notificationsService.markAsRead("n1");
      expect(res.isRead).toBe(true);
      expect(prisma.inAppNotification.update).toHaveBeenCalledWith({
        where: { id: "n1" },
        data: expect.objectContaining({ isRead: true }),
      });
    });

    it("should mark all matching notifications as read", async () => {
      jest.spyOn(prisma.inAppNotification, "updateMany").mockResolvedValue({ count: 5 });

      await notificationsService.markAllAsRead({ tenantId: "t-1" });
      expect(prisma.inAppNotification.updateMany).toHaveBeenCalledWith({
        where: { isRead: false, tenantId: "t-1" },
        data: expect.objectContaining({ isRead: true }),
      });
    });
  });

  describe("Multi-Profile Event Notifiers", () => {
    it("notifyBookingConfirmed: should dispatch to customer, owner and assigned staff", async () => {
      const mockBooking = {
        id: "b-100",
        tenantId: "t-1",
        customerName: "Ravi Kesharwani",
        customerEmail: "84ravikesharwani@gmail.com",
        customerPhone: "+919876543210",
        startTime: new Date("2026-11-25T10:00:00Z"),
        price: 999,
        service: { name: "Ayurvedic Herbal Facial" },
        staff: { name: "Priya Verma", email: "priya@salon.com", phone: "+919876500000" },
        tenant: { name: "Radha Beauty Salon", email: "owner@salon.com" },
      };

      jest.spyOn(prisma.booking, "findUnique").mockResolvedValue(mockBooking);
      const sendEmailSpy = jest.spyOn(notificationsService, "_send").mockResolvedValue();
      const sendSMSSpy = jest.spyOn(notificationsService, "sendSMS").mockResolvedValue();
      const inAppSpy = jest.spyOn(notificationsService, "createInApp").mockResolvedValue({});

      await notificationsService.notifyBookingConfirmed("b-100");

      // Verify Customer confirmation
      expect(sendEmailSpy).toHaveBeenCalledWith(expect.objectContaining({
        to: "84ravikesharwani@gmail.com",
        type: "CONFIRMATION",
      }));
      expect(sendSMSSpy).toHaveBeenCalledWith(expect.objectContaining({
        to: "+919876543210",
        type: "SMS_CONFIRMATION",
      }));
      expect(inAppSpy).toHaveBeenCalledWith(expect.objectContaining({
        userEmail: "84ravikesharwani@gmail.com",
        role: "CUSTOMER",
      }));

      // Verify Owner notification
      expect(inAppSpy).toHaveBeenCalledWith(expect.objectContaining({
        tenantId: "t-1",
        role: "OWNER",
      }));
      expect(sendEmailSpy).toHaveBeenCalledWith(expect.objectContaining({
        to: "owner@salon.com",
        type: "OWNER_BOOKING_ALERT",
      }));

      // Verify Staff notification
      expect(sendEmailSpy).toHaveBeenCalledWith(expect.objectContaining({
        to: "priya@salon.com",
        type: "STAFF_APPOINTMENT_ASSIGNED",
      }));
    });

    it("notifyBookingCancelled: should alert customer, owner, and staff of freed slot", async () => {
      const mockBooking = {
        id: "b-100",
        tenantId: "t-1",
        customerName: "Ravi Kesharwani",
        customerEmail: "84ravikesharwani@gmail.com",
        startTime: new Date("2026-11-25T10:00:00Z"),
        service: { name: "Ayurvedic Herbal Facial" },
        staff: { name: "Priya Verma", email: "priya@salon.com" },
        tenant: { name: "Radha Beauty Salon", email: "owner@salon.com" },
      };

      jest.spyOn(prisma.booking, "findUnique").mockResolvedValue(mockBooking);
      const sendEmailSpy = jest.spyOn(notificationsService, "_send").mockResolvedValue();
      const inAppSpy = jest.spyOn(notificationsService, "createInApp").mockResolvedValue({});

      await notificationsService.notifyBookingCancelled("b-100", "Schedule conflict");

      expect(inAppSpy).toHaveBeenCalledWith(expect.objectContaining({
        role: "CUSTOMER",
        type: "BOOKING_CANCELLED",
      }));
      expect(inAppSpy).toHaveBeenCalledWith(expect.objectContaining({
        role: "OWNER",
        type: "BOOKING_CANCELLED",
      }));
      expect(sendEmailSpy).toHaveBeenCalledWith(expect.objectContaining({
        to: "owner@salon.com",
        type: "OWNER_BOOKING_CANCELLED",
      }));
      expect(sendEmailSpy).toHaveBeenCalledWith(expect.objectContaining({
        to: "priya@salon.com",
        type: "STAFF_APPOINTMENT_CANCELLED",
      }));
    });

    it("notifyStaffApplicationReceived: should alert owner and confirm to applicant", async () => {
      const validAppId = "a0000000-0000-0000-0000-000000000050";
      const mockApp = {
        id: validAppId,
        tenantId: "t-1",
        applicantName: "Sunil Verma",
        roleTitle: "Senior Stylist",
        email: "sunil@gmail.com",
        experience: "5 years",
        tenant: { name: "Radha Beauty Salon", email: "owner@salon.com" },
      };

      jest.spyOn(prisma.staffApplication, "findUnique").mockResolvedValue(mockApp);
      const sendEmailSpy = jest.spyOn(notificationsService, "_send").mockResolvedValue();
      const inAppSpy = jest.spyOn(notificationsService, "createInApp").mockResolvedValue({});

      await notificationsService.notifyStaffApplicationReceived(validAppId);

      expect(inAppSpy).toHaveBeenCalledWith(expect.objectContaining({
        tenantId: "t-1",
        role: "OWNER",
        type: "STAFF_APPLICATION",
      }));
      expect(sendEmailSpy).toHaveBeenCalledWith(expect.objectContaining({
        to: "owner@salon.com",
        type: "OWNER_STAFF_APP_ALERT",
      }));
      expect(sendEmailSpy).toHaveBeenCalledWith(expect.objectContaining({
        to: "sunil@gmail.com",
        type: "CANDIDATE_APP_CONFIRMATION",
      }));
    });

    it("notifyStaffApplicationDecision: should send acceptance offer or rejection email", async () => {
      const validAppId = "a0000000-0000-0000-0000-000000000050";
      const mockApp = {
        id: validAppId,
        applicantName: "Sunil Verma",
        roleTitle: "Senior Stylist",
        email: "sunil@gmail.com",
        tenant: { name: "Radha Beauty Salon" },
      };

      jest.spyOn(prisma.staffApplication, "findUnique").mockResolvedValue(mockApp);
      const sendEmailSpy = jest.spyOn(notificationsService, "_send").mockResolvedValue();

      await notificationsService.notifyStaffApplicationDecision(validAppId, "ACCEPTED", "Welcome aboard!");
      expect(sendEmailSpy).toHaveBeenCalledWith(expect.objectContaining({
        to: "sunil@gmail.com",
        type: "CANDIDATE_HIRED_OFFER",
      }));

      await notificationsService.notifyStaffApplicationDecision(validAppId, "REJECTED");
      expect(sendEmailSpy).toHaveBeenCalledWith(expect.objectContaining({
        to: "sunil@gmail.com",
        type: "CANDIDATE_REJECTED",
      }));
    });

    it("notifyChatMessage: should route customer replies to my-bookings with openChat", async () => {
      const inAppSpy = jest.spyOn(notificationsService, "createInApp").mockResolvedValue({});
      jest.spyOn(prisma.tenant, "findUnique").mockResolvedValue({ id: "t-1", slug: "radha-salon", email: "owner@salon.com" });

      await notificationsService.notifyChatMessage({
        tenantId: "t-1",
        senderType: "OWNER",
        senderName: "Radha Sharma",
        senderEmail: "owner@salon.com",
        recipientEmail: "customer@gmail.com",
        message: "Hello, looking forward to your appointment!",
        threadId: "booking_b-12345",
      });

      expect(inAppSpy).toHaveBeenCalledWith(expect.objectContaining({
        role: "CUSTOMER",
        type: "CHAT_MESSAGE",
        link: "/my-bookings?openChat=b-12345",
        userEmail: "customer@gmail.com",
      }));
    });

    it("notifyChatMessage: should route incoming customer messages to dashboard/chat for owner", async () => {
      const inAppSpy = jest.spyOn(notificationsService, "createInApp").mockResolvedValue({});
      jest.spyOn(prisma.tenant, "findUnique").mockResolvedValue({ id: "t-1", slug: "radha-salon", email: "owner@salon.com" });

      await notificationsService.notifyChatMessage({
        tenantId: "t-1",
        senderType: "CUSTOMER",
        senderName: "Amit Kumar",
        senderEmail: "customer@gmail.com",
        recipientEmail: "owner@salon.com",
        message: "Can I bring my friend along?",
        threadId: "booking_b-12345",
      });

      expect(inAppSpy).toHaveBeenCalledWith(expect.objectContaining({
        tenantId: "t-1",
        role: "OWNER",
        type: "CHAT_MESSAGE",
        link: "/dashboard/chat?threadId=booking_b-12345",
      }));
    });
  });
});
