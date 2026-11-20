require("dotenv").config();
const prisma = require("../../src/utils/prisma.client");
const staffService = require("../../src/services/staff.service");
const authService = require("../../src/services/auth.service");
const chatService = require("../../src/services/chat.service");
const notificationsService = require("../../src/services/notifications.service");

describe("Dedicated Staff Portal & Credentials Provisioning", () => {
  const tenantId = "a0000000-0000-0000-0000-000000000001";
  const staffId = "b0000000-0000-0000-0000-000000000002";
  const userId = "c0000000-0000-0000-0000-000000000003";

  beforeEach(() => {
    jest.spyOn(notificationsService, "sendStaffCredentialsEmail").mockResolvedValue();
    jest.spyOn(notificationsService, "notifyChatMessage").mockResolvedValue();
    if (prisma.inAppNotification) {
      jest.spyOn(prisma.inAppNotification, "create").mockResolvedValue({});
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("Public Signup Restriction for Staff", () => {
    it("should disallow public registration with role STAFF", async () => {
      await expect(
        authService.register({
          name: "Ravi Staff",
          email: "staff@example.com",
          password: "Password@123",
          role: "STAFF",
        })
      ).rejects.toThrow(/Staff accounts cannot be registered publicly/i);
    });
  });

  describe("provisionStaffCredentials", () => {
    it("should provision staff credentials, create User account, send email, and post in internal chat thread", async () => {
      const mockStaff = {
        id: staffId,
        tenantId,
        name: "Priya Sharma",
        email: "priya@radhabeauty.com",
        tenant: {
          id: tenantId,
          name: "Radha Beauty Salon",
          slug: "radha-salon",
          email: "owner@radhabeauty.com",
        },
      };

      const mockCreatedUser = {
        id: userId,
        tenantId,
        name: "Priya Sharma",
        email: "priya@radhabeauty.com",
        role: "STAFF",
        emailVerified: true,
        isActive: true,
      };

      const mockChatMessage = {
        id: "msg-cred-1",
        tenantId,
        threadId: `staff_${staffId}`,
        senderType: "OWNER",
        senderName: "Radha Beauty Salon",
        senderEmail: "owner@radhabeauty.com",
        recipientEmail: "priya@radhabeauty.com",
        message: "🔐 Staff Portal Login Credentials Generated",
        isRead: false,
        createdAt: new Date(),
      };

      jest.spyOn(prisma.staff, "findFirst").mockResolvedValue(mockStaff);
      jest.spyOn(prisma.user, "findFirst").mockResolvedValue(null);
      jest.spyOn(prisma.user, "create").mockResolvedValue(mockCreatedUser);
      jest.spyOn(prisma.chatMessage, "create").mockResolvedValue(mockChatMessage);

      const result = await staffService.provisionStaffCredentials(tenantId, staffId, {
        password: "CustomPass@2026!",
      });

      expect(result.success).toBe(true);
      expect(result.staffName).toBe("Priya Sharma");
      expect(result.email).toBe("priya@radhabeauty.com");
      expect(result.temporaryPassword).toBe("CustomPass@2026!");
      expect(result.userId).toBe(userId);

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId,
          email: "priya@radhabeauty.com",
          role: "STAFF",
          name: "Priya Sharma",
          emailVerified: true,
          isActive: true,
        }),
      });

      expect(notificationsService.sendStaffCredentialsEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "priya@radhabeauty.com",
          staffName: "Priya Sharma",
          tenantName: "Radha Beauty Salon",
          email: "priya@radhabeauty.com",
          temporaryPassword: "CustomPass@2026!",
        })
      );

      expect(prisma.chatMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId,
          threadId: `staff_${staffId}`,
          senderType: "OWNER",
          recipientEmail: "priya@radhabeauty.com",
        }),
      });
    });

    it("should update existing user if account with email already exists", async () => {
      const mockStaff = {
        id: staffId,
        tenantId,
        name: "Anita Stylist",
        email: "anita@salon.com",
        tenant: {
          id: tenantId,
          name: "Radha Salon",
          slug: "radha",
          email: "owner@salon.com",
        },
      };

      const existingUser = {
        id: userId,
        email: "anita@salon.com",
      };

      jest.spyOn(prisma.staff, "findFirst").mockResolvedValue(mockStaff);
      jest.spyOn(prisma.user, "findFirst").mockResolvedValue(existingUser);
      jest.spyOn(prisma.user, "update").mockResolvedValue({
        id: userId,
        email: "anita@salon.com",
        role: "STAFF",
      });
      jest.spyOn(prisma.chatMessage, "create").mockResolvedValue({ id: "msg-2" });

      const res = await staffService.provisionStaffCredentials(tenantId, staffId);
      expect(res.success).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: expect.objectContaining({
          tenantId,
          role: "STAFF",
          isActive: true,
        }),
      });
    });
  });

  describe("Owner <-> Staff Real-Time Team Chat", () => {
    it("should support messages sent by STAFF in staff_<staffId> thread", async () => {
      const mockStaff = {
        id: staffId,
        tenantId,
        name: "Priya Sharma",
        email: "priya@radhabeauty.com",
        tenant: {
          id: tenantId,
          name: "Radha Beauty Salon",
          email: "owner@radhabeauty.com",
        },
      };

      const mockMsg = {
        id: "msg-staff-1",
        tenantId,
        threadId: `staff_${staffId}`,
        senderType: "STAFF",
        senderName: "Priya Sharma",
        senderEmail: "priya@radhabeauty.com",
        recipientEmail: "owner@radhabeauty.com",
        message: "Hello! Can I adjust my shift next Tuesday?",
        isRead: false,
        createdAt: new Date(),
      };

      jest.spyOn(prisma.staff, "findFirst").mockResolvedValue(mockStaff);
      jest.spyOn(prisma.chatMessage, "create").mockResolvedValue(mockMsg);

      const res = await chatService.sendMessage({
        tenantId,
        threadId: `staff_${staffId}`,
        staffId,
        senderType: "STAFF",
        senderName: "Priya Sharma",
        senderEmail: "priya@radhabeauty.com",
        message: "Hello! Can I adjust my shift next Tuesday?",
      });

      expect(res.senderType).toBe("STAFF");
      expect(res.threadId).toBe(`staff_${staffId}`);
      expect(res.message).toBe("Hello! Can I adjust my shift next Tuesday?");
    });
  });
});
