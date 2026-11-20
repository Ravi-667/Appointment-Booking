require("dotenv").config();
const prisma = require("../../src/utils/prisma.client");
const chatService = require("../../src/services/chat.service");
const notificationsService = require("../../src/services/notifications.service");

describe("ChatService - Dual Chat Panels", () => {
  beforeEach(() => {
    jest.spyOn(notificationsService, "notifyChatMessage").mockResolvedValue();
    if (prisma.inAppNotification) {
      jest.spyOn(prisma.inAppNotification, "create").mockResolvedValue({});
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("sendMessage - Visitor Global Inquiry", () => {
    it("should create an inquiry chat message and resolve canonical threadId", async () => {
      const mockCreated = {
        id: "msg-1",
        tenantId: "t-1",
        threadId: "inquiry_visitor@gmail.com",
        bookingId: null,
        senderType: "VISITOR",
        senderName: "Pooja Mehta",
        senderEmail: "visitor@gmail.com",
        recipientEmail: "owner@salon.com",
        message: "Do you offer hair coloring services?",
        isRead: false,
        createdAt: new Date(),
      };

      jest.spyOn(prisma.tenant, "findUnique").mockResolvedValue({ id: "t-1", email: "owner@salon.com" });
      jest.spyOn(prisma.chatMessage, "create").mockResolvedValue(mockCreated);

      const result = await chatService.sendMessage({
        tenantId: "t-1",
        senderType: "VISITOR",
        senderName: "Pooja Mehta",
        senderEmail: "visitor@gmail.com",
        message: "Do you offer hair coloring services?",
      });

      expect(result.id).toBe("msg-1");
      expect(result.threadId).toBe("inquiry_visitor@gmail.com");
      expect(result.senderType).toBe("VISITOR");
      expect(result.message).toBe("Do you offer hair coloring services?");
    });
  });

  describe("sendMessage - Customer Booking Chat", () => {
    it("should create a booking consultation message linked to bookingId", async () => {
      const mockBooking = {
        id: "b-100",
        tenantId: "t-1",
        customerName: "Ravi Kesharwani",
        customerEmail: "84ravikesharwani@gmail.com",
        tenant: { email: "owner@salon.com" },
      };

      const mockCreated = {
        id: "msg-2",
        tenantId: "t-1",
        threadId: "booking_b-100",
        bookingId: "b-100",
        senderType: "CUSTOMER",
        senderName: "Ravi Kesharwani",
        senderEmail: "84ravikesharwani@gmail.com",
        recipientEmail: "owner@salon.com",
        message: "Can I bring my own herbal shampoo?",
        isRead: false,
        createdAt: new Date(),
      };

      jest.spyOn(prisma.booking, "findFirst").mockResolvedValue(mockBooking);
      jest.spyOn(prisma.chatMessage, "create").mockResolvedValue(mockCreated);

      const result = await chatService.sendMessage({
        tenantId: "t-1",
        bookingId: "b-100",
        senderType: "CUSTOMER",
        senderName: "Ravi Kesharwani",
        senderEmail: "84ravikesharwani@gmail.com",
        message: "Can I bring my own herbal shampoo?",
      });

      expect(result.bookingId).toBe("b-100");
      expect(result.threadId).toBe("booking_b-100");
      expect(result.senderType).toBe("CUSTOMER");
    });
  });

  describe("getThreadsForTenant - Owner Inbox", () => {
    it("should group messages into inquiries and bookings with unread counts", async () => {
      const mockMessages = [
        {
          id: "m-1",
          tenantId: "t-1",
          threadId: "inquiry_guest@gmail.com",
          bookingId: null,
          senderType: "VISITOR",
          senderName: "Guest User",
          senderEmail: "guest@gmail.com",
          recipientEmail: "owner@salon.com",
          message: "Hi, what are your opening hours?",
          isRead: false,
          createdAt: new Date(),
          booking: null,
        },
        {
          id: "m-2",
          tenantId: "t-1",
          threadId: "booking_b-200",
          bookingId: "b-200",
          senderType: "CUSTOMER",
          senderName: "Anita Roy",
          senderEmail: "anita@gmail.com",
          recipientEmail: "owner@salon.com",
          message: "Please note I might be 5 mins late.",
          isRead: false,
          createdAt: new Date(),
          booking: {
            id: "b-200",
            customerName: "Anita Roy",
            customerEmail: "anita@gmail.com",
            startTime: new Date(),
            status: "CONFIRMED",
            service: { name: "Facial Care" },
          },
        },
      ];

      jest.spyOn(prisma.chatMessage, "findMany").mockResolvedValue(mockMessages);

      const inbox = await chatService.getThreadsForTenant("t-1");

      expect(inbox.totalUnread).toBe(2);
      expect(inbox.inquiries.length).toBe(1);
      expect(inbox.bookings.length).toBe(1);
      expect(inbox.inquiries[0].threadId).toBe("inquiry_guest@gmail.com");
      expect(inbox.bookings[0].threadId).toBe("booking_b-200");
    });
  });

  describe("markAsRead", () => {
    it("should mark messages as read for a thread", async () => {
      jest.spyOn(prisma.chatMessage, "updateMany").mockResolvedValue({ count: 3 });

      const res = await chatService.markAsRead({
        tenantId: "t-1",
        threadId: "booking_b-100",
        readByType: "OWNER",
      });

      expect(res.success).toBe(true);
      expect(res.count).toBe(3);
    });
  });
});
