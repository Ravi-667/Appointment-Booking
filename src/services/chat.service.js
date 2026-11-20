const prisma = require("../utils/prisma.client");
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function makeError(message, statusCode = 400) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

class ChatService {
  /**
   * Helper to derive canonical threadId
   */
  resolveThreadId({ threadId, staffId, bookingId, visitorEmail, recipientEmail, senderEmail, senderType }) {
    if (threadId) {
      return threadId;
    }
    if (staffId) {
      return `staff_${staffId}`;
    }
    if (bookingId) {
      return `booking_${bookingId}`;
    }
    if (visitorEmail) {
      return `inquiry_${visitorEmail.toLowerCase().trim()}`;
    }
    if (senderType === "OWNER" && recipientEmail) {
      return `inquiry_${recipientEmail.toLowerCase().trim()}`;
    }
    if (senderEmail) {
      return `inquiry_${senderEmail.toLowerCase().trim()}`;
    }
    throw makeError("Unable to resolve thread ID. Missing bookingId, staffId, or email", 400);
  }

  /**
   * Send a new chat message
   */
  async sendMessage({
    tenantId,
    threadId: explicitThreadId,
    staffId,
    bookingId,
    visitorEmail,
    recipientEmail,
    senderType,
    senderId,
    senderName,
    senderEmail,
    message,
    io,
  }) {
    if (!tenantId) throw makeError("tenantId is required", 400);
    if (!message || !message.trim()) throw makeError("Message content cannot be empty", 400);
    if (!senderName || !senderName.trim()) throw makeError("senderName is required", 400);
    if (!senderEmail || !senderEmail.trim()) throw makeError("senderEmail is required", 400);

    const validTypes = ["CUSTOMER", "OWNER", "VISITOR", "STAFF"];
    const type = (senderType || "VISITOR").toUpperCase();
    if (!validTypes.includes(type)) {
      throw makeError(`Invalid senderType: ${senderType}`, 400);
    }

    const threadId = this.resolveThreadId({
      threadId: explicitThreadId,
      staffId,
      bookingId,
      visitorEmail,
      recipientEmail,
      senderEmail,
      senderType: type,
    });

    let validBookingId = null;
    let actualRecipientEmail = recipientEmail || null;

    if (bookingId) {
      const booking = await prisma.booking.findFirst({
        where: { id: bookingId, tenantId },
        include: { service: true, tenant: true },
      });
      if (!booking) throw makeError("Booking not found for this tenant", 404);
      validBookingId = booking.id;

      if (type === "CUSTOMER") {
        actualRecipientEmail = booking.tenant?.email || null;
      } else if (type === "OWNER") {
        actualRecipientEmail = booking.customerEmail;
      }
    } else if (threadId && threadId.startsWith("staff_") || staffId) {
      const sId = staffId || (threadId ? threadId.replace("staff_", "") : "");
      const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (sId && UUID_REGEX.test(sId)) {
        try {
          const staff = await prisma.staff.findFirst({
            where: { id: sId, tenantId },
            include: { tenant: true },
          });
          if (staff) {
            if (type === "OWNER") {
              actualRecipientEmail = actualRecipientEmail || staff.email;
              if (!senderName || senderName === "Salon Owner") senderName = staff.tenant?.name || "Business Owner";
            } else if (type === "STAFF") {
              actualRecipientEmail = actualRecipientEmail || staff.tenant?.email;
              if (!senderName || senderName === "Customer") senderName = staff.name || "Staff Specialist";
            }
          }
        } catch (err) {
          console.warn("Staff lookup warning in sendMessage:", err.message);
        }
      }
    } else {
      if (type === "VISITOR") {
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
        actualRecipientEmail = tenant?.email || null;
      }
    }

    const chatMessage = await prisma.chatMessage.create({
      data: {
        tenantId,
        threadId,
        bookingId: validBookingId,
        senderType: type,
        senderId: senderId || null,
        senderName: senderName.trim(),
        senderEmail: senderEmail.toLowerCase().trim(),
        recipientEmail: actualRecipientEmail ? actualRecipientEmail.toLowerCase().trim() : null,
        message: message.trim(),
        isRead: false,
      },
    });

    // Real-Time Socket.io Broadcast
    if (io) {
      try {
        // Broadcast to specific thread room
        io.to(threadId).emit("chat:message", chatMessage);
        // Also notify the tenant dashboard channel
        io.to(`tenant:${tenantId}`).emit("chat:notification", {
          threadId,
          bookingId: validBookingId,
          type: validBookingId ? "BOOKING" : "INQUIRY",
          message: chatMessage,
        });
      } catch (err) {
        console.warn("Socket broadcast warning:", err.message);
      }
    }

    const notificationsService = require("./notifications.service");
    await notificationsService.notifyChatMessage({
      tenantId,
      senderType: type,
      senderName: senderName.trim(),
      senderEmail: senderEmail.toLowerCase().trim(),
      recipientEmail: actualRecipientEmail ? actualRecipientEmail.toLowerCase().trim() : null,
      message: message.trim(),
      threadId,
    }).catch(err => console.warn("Chat notification warning:", err.message));

    return chatMessage;
  }

  /**
   * Get messages for a specific conversation thread
   */
  async getMessages({ tenantId, threadId, bookingId, visitorEmail }) {
    if (!tenantId) throw makeError("tenantId is required", 400);

    let resolvedThreadId = threadId;
    if (!resolvedThreadId) {
      resolvedThreadId = this.resolveThreadId({ bookingId, visitorEmail });
    }

    const messages = await prisma.chatMessage.findMany({
      where: {
        tenantId,
        threadId: resolvedThreadId,
      },
      orderBy: { createdAt: "asc" },
    });

    // Optional booking details if booking-scoped
    let booking = null;
    if (bookingId || resolvedThreadId.startsWith("booking_")) {
      const bId = bookingId || resolvedThreadId.replace("booking_", "");
      booking = await prisma.booking.findFirst({
        where: { id: bId, tenantId },
        include: { service: true, staff: true },
      });
    }

    // Optional staff details if staff-scoped
    let staff = null;
    if (resolvedThreadId.startsWith("staff_")) {
      const sId = resolvedThreadId.replace("staff_", "");
      const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (UUID_REGEX.test(sId)) {
        try {
          staff = await prisma.staff.findFirst({
            where: { id: sId, tenantId },
            include: { staffServices: { include: { service: true } } },
          });
        } catch (err) {
          console.warn("Staff lookup in getMessages warning:", err.message);
        }
      }
    }

    return {
      threadId: resolvedThreadId,
      booking,
      staff,
      messages,
    };
  }

  /**
   * Get all conversation threads for a tenant owner dashboard
   */
  async getThreadsForTenant(tenantId, { includeRecentBookings = false } = {}) {
    if (!tenantId) throw makeError("tenantId is required", 400);

    const messages = await prisma.chatMessage.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      include: {
        booking: {
          select: {
            id: true,
            customerName: true,
            customerEmail: true,
            startTime: true,
            status: true,
            service: { select: { name: true } },
          },
        },
      },
    });

    const threadMap = new Map();
    let totalUnread = 0;

    for (const msg of messages) {
      if (!threadMap.has(msg.threadId)) {
        const isBooking = msg.threadId.startsWith("booking_");
        const isStaff = msg.threadId.startsWith("staff_");
        const b = msg.booking;
        const participantName = isStaff
          ? (msg.senderType === "STAFF" ? msg.senderName : (msg.recipientEmail ? msg.recipientEmail.split("@")[0] : "Staff Member"))
          : (isBooking
            ? (b?.customerName || msg.senderName)
            : (msg.senderType === "VISITOR" ? msg.senderName : (msg.recipientEmail ? msg.recipientEmail.split("@")[0] : "Prospective Customer")));
        const participantEmail = isStaff
          ? (msg.senderType === "STAFF" ? msg.senderEmail : msg.recipientEmail)
          : (isBooking
            ? (b?.customerEmail || msg.senderEmail)
            : (msg.senderType === "VISITOR" ? msg.senderEmail : msg.recipientEmail));

        threadMap.set(msg.threadId, {
          threadId: msg.threadId,
          type: isStaff ? "STAFF" : (isBooking ? "BOOKING" : "INQUIRY"),
          bookingId: msg.bookingId,
          booking: b || null,
          staffId: isStaff ? msg.threadId.replace("staff_", "") : null,
          title: isStaff
            ? `Team: ${participantName}`
            : (isBooking
              ? `${b?.customerName || "Customer"} (${b?.service?.name || "Booking"})`
              : participantName),
          participantName: participantName,
          participantEmail: participantEmail,
          customerName: participantName,
          customerEmail: participantEmail,
          senderName: participantName,
          senderEmail: participantEmail,
          lastMessage: msg.message,
          lastMessageAt: msg.createdAt,
          lastSenderType: msg.senderType,
          unreadCount: 0,
        });
      }

      const thread = threadMap.get(msg.threadId);
      if (!msg.isRead && msg.senderType !== "OWNER") {
        thread.unreadCount++;
        totalUnread++;
      }
    }

    // Include all staff members for internal team chat
    if (UUID_REGEX.test(tenantId) && prisma.staff && typeof prisma.staff.findMany === "function") {
      try {
        const allStaff = await prisma.staff.findMany({
          where: { tenantId },
          select: { id: true, name: true, roleTitle: true, email: true, phone: true, isActive: true },
        });

        if (Array.isArray(allStaff)) {
          for (const s of allStaff) {
            const threadId = `staff_${s.id}`;
            if (!threadMap.has(threadId)) {
              threadMap.set(threadId, {
                threadId,
                type: "STAFF",
                staffId: s.id,
                staff: s,
                title: `${s.name} (${s.roleTitle || "Specialist"})`,
                participantName: s.name,
                participantEmail: s.email || "",
                customerName: s.name,
                customerEmail: s.email || "",
                senderName: s.name,
                senderEmail: s.email || "",
                lastMessage: "No team messages yet — click to chat with staff member",
                lastMessageAt: s.createdAt || new Date(),
                lastSenderType: null,
                unreadCount: 0,
              });
            } else {
              const thread = threadMap.get(threadId);
              thread.type = "STAFF";
              thread.staff = s;
              thread.staffId = s.id;
              thread.title = `${s.name} (${s.roleTitle || "Specialist"})`;
              thread.participantName = s.name;
              thread.participantEmail = s.email || thread.participantEmail;
            }
          }
        }
      } catch (err) {
        console.warn("Could not load staff for chat:", err.message);
      }
    }

    // Safely include recent bookings for this tenant so owner can initiate consultations
    if (includeRecentBookings && prisma.booking && typeof prisma.booking.findMany === "function") {
      try {
        const recentBookings = await prisma.booking.findMany({
          where: { tenantId },
          orderBy: { startTime: "desc" },
          take: 50,
          select: {
            id: true,
            customerName: true,
            customerEmail: true,
            startTime: true,
            status: true,
            service: { select: { name: true } },
          },
        });

        if (Array.isArray(recentBookings)) {
          for (const b of recentBookings) {
            const threadId = `booking_${b.id}`;
            if (!threadMap.has(threadId)) {
              threadMap.set(threadId, {
                threadId,
                type: "BOOKING",
                bookingId: b.id,
                booking: {
                  id: b.id,
                  customerName: b.customerName,
                  customerEmail: b.customerEmail,
                  startTime: b.startTime,
                  status: b.status,
                  service: b.service,
                },
                title: `${b.customerName || "Customer"} (${b.service?.name || "Booking"})`,
                participantName: b.customerName || "Customer",
                participantEmail: b.customerEmail || "",
                customerName: b.customerName || "Customer",
                customerEmail: b.customerEmail || "",
                senderName: b.customerName || "Customer",
                senderEmail: b.customerEmail || "",
                lastMessage: "No consultation messages yet — click to chat with customer",
                lastMessageAt: b.startTime,
                lastSenderType: null,
                unreadCount: 0,
              });
            }
          }
        }
      } catch (err) {
        console.warn("Could not load recent bookings for chat:", err.message);
      }
    }

    const threads = Array.from(threadMap.values());
    const inquiries = threads.filter((t) => t.type === "INQUIRY");
    const bookings = threads.filter((t) => t.type === "BOOKING");
    const staff = threads.filter((t) => t.type === "STAFF");

    return {
      totalUnread,
      threads,
      inquiries,
      bookings,
      staff,
    };
  }

  /**
   * Mark messages in a thread as read
   */
  async markAsRead({ tenantId, threadId, readByType = "OWNER" }) {
    if (!tenantId || !threadId) throw makeError("tenantId and threadId are required", 400);

    const where = {
      tenantId,
      threadId,
      isRead: false,
    };

    if (readByType === "OWNER") {
      where.senderType = { in: ["CUSTOMER", "VISITOR", "STAFF"] };
    } else {
      where.senderType = "OWNER";
    }

    const result = await prisma.chatMessage.updateMany({
      where,
      data: { isRead: true },
    });

    return { success: true, count: result.count };
  }
}

module.exports = new ChatService();
