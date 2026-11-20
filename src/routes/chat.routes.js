const router = require("express").Router();
const chatService = require("../services/chat.service");
const prisma = require("../utils/prisma.client");
const { verifyAccessToken } = require("../utils/jwt.utils");

// Middleware to extract user from session or Bearer token if present
async function optionalAuth(req, res, next) {
  try {
    if (req.session && req.session.user) {
      req.user = req.session.user;
    } else if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
      const payload = verifyAccessToken(req.headers.authorization.split(" ")[1]);
      if (payload && payload.sub) {
        const u = await prisma.user.findUnique({
          where: { id: payload.sub },
          select: { id: true, name: true, email: true, role: true, tenantId: true },
        });
        if (u) req.user = u;
      }
    }
  } catch {}
  next();
}

// Send a chat message
router.post("/messages", optionalAuth, async (req, res, next) => {
  try {
    const isStaff = req.user?.role === "STAFF" || req.body.senderType === "STAFF";
    const isExplicitVisitorOrCustomer = !isStaff && (req.body.senderType === "VISITOR" || req.body.senderType === "CUSTOMER");
    const isOwner = !isStaff && !isExplicitVisitorOrCustomer && (req.user?.role === "OWNER" || req.user?.role === "BUSINESS_OWNER" || !!req.user?.tenantId || req.body.senderType === "OWNER");
    let tenantId = req.body.tenantId || (req.user?.tenantId ? req.user.tenantId : null);

    if (!tenantId && req.user?.id) {
      const u = await prisma.user.findUnique({ where: { id: req.user.id }, select: { tenantId: true } });
      if (u?.tenantId) {
        tenantId = u.tenantId;
        if (req.user) req.user.tenantId = u.tenantId;
      }
    }

    // If tenantId missing but bookingId provided, look up booking
    if (!tenantId && req.body.bookingId) {
      const b = await prisma.booking.findUnique({ where: { id: req.body.bookingId } });
      if (b) tenantId = b.tenantId;
    }

    // If tenantId missing but staffId or staff_ threadId provided
    if (!tenantId && (req.body.staffId || (req.body.threadId && req.body.threadId.startsWith("staff_")))) {
      const sId = req.body.staffId || req.body.threadId.replace("staff_", "");
      const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (UUID_REGEX.test(sId)) {
        try {
          const s = await prisma.staff.findUnique({ where: { id: sId } });
          if (s) tenantId = s.tenantId;
        } catch {}
      }
    }

    const senderType = isStaff ? "STAFF" : (isOwner ? "OWNER" : (req.body.senderType || "VISITOR"));
    const defaultName = isStaff ? "Staff Specialist" : (isOwner ? "Salon Owner" : "Customer");
    const defaultEmail = isStaff ? "staff@salon.com" : (isOwner ? "owner@salon.com" : "customer@example.com");

    const senderName = (isStaff || isOwner ? req.user?.name : req.body.senderName) || req.body.senderName || defaultName;
    const senderEmail = (isStaff || isOwner ? req.user?.email : req.body.senderEmail) || req.body.senderEmail || defaultEmail;

    const payload = {
      tenantId,
      threadId: req.body.threadId || null,
      staffId: req.body.staffId || null,
      bookingId: req.body.bookingId || null,
      visitorEmail: req.body.visitorEmail || null,
      recipientEmail: req.body.recipientEmail || null,
      senderType,
      senderId: req.user ? req.user.id : null,
      senderName,
      senderEmail,
      message: req.body.message,
      io: req.app.get("io"),
    };

    const message = await chatService.sendMessage(payload);
    res.status(201).json(message);
  } catch (err) {
    next(err);
  }
});

// Get messages for a thread (by threadId, bookingId, or visitorEmail)
router.get("/messages", optionalAuth, async (req, res, next) => {
  try {
    let tenantId = req.query.tenantId || req.user?.tenantId;
    const { threadId, bookingId, visitorEmail } = req.query;

    if (!tenantId && req.user?.id) {
      const u = await prisma.user.findUnique({ where: { id: req.user.id }, select: { tenantId: true } });
      if (u?.tenantId) tenantId = u.tenantId;
    }

    // If tenantId is not passed but bookingId, booking_ or staff_ threadId is, resolve tenantId
    if (!tenantId && (bookingId || (threadId && (threadId.startsWith("booking_") || threadId.startsWith("staff_"))))) {
      const isStaffThread = threadId && threadId.startsWith("staff_");
      const targetId = isStaffThread ? threadId.replace("staff_", "") : (bookingId || threadId.replace("booking_", ""));
      const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (UUID_REGEX.test(targetId)) {
        try {
          if (isStaffThread) {
            const s = await prisma.staff.findUnique({ where: { id: targetId } });
            if (s) tenantId = s.tenantId;
          } else {
            const b = await prisma.booking.findUnique({ where: { id: targetId } });
            if (b) tenantId = b.tenantId;
          }
        } catch {}
      }
    }

    if (!tenantId) {
      return res.status(400).json({ message: "tenantId is required" });
    }

    const result = await chatService.getMessages({
      tenantId,
      threadId,
      bookingId,
      visitorEmail,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Owner Dashboard: Get all conversation threads
router.get("/threads", optionalAuth, async (req, res, next) => {
  try {
    let tenantId = req.query.tenantId || req.user?.tenantId;

    if (!tenantId && req.user?.id) {
      const u = await prisma.user.findUnique({ where: { id: req.user.id }, select: { tenantId: true } });
      if (u?.tenantId) {
        tenantId = u.tenantId;
        if (req.user) req.user.tenantId = u.tenantId;
      }
    }

    if (!tenantId) {
      return res.status(401).json({ message: "Owner authentication or tenantId required" });
    }

    const threads = await chatService.getThreadsForTenant(tenantId, { includeRecentBookings: true });
    res.json(threads);
  } catch (err) {
    next(err);
  }
});

// Mark a conversation thread as read
router.patch("/read", optionalAuth, async (req, res, next) => {
  try {
    let tenantId = req.body.tenantId || req.user?.tenantId;
    const { threadId } = req.body;

    if (!tenantId && req.user?.id) {
      const u = await prisma.user.findUnique({ where: { id: req.user.id }, select: { tenantId: true } });
      if (u?.tenantId) tenantId = u.tenantId;
    }

    if (!tenantId && threadId && (threadId.startsWith("booking_") || threadId.startsWith("staff_"))) {
      const isStaffThread = threadId.startsWith("staff_");
      const targetId = isStaffThread ? threadId.replace("staff_", "") : threadId.replace("booking_", "");
      const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (UUID_REGEX.test(targetId)) {
        try {
          if (isStaffThread) {
            const s = await prisma.staff.findUnique({ where: { id: targetId } });
            if (s) tenantId = s.tenantId;
          } else {
            const b = await prisma.booking.findUnique({ where: { id: targetId } });
            if (b) tenantId = b.tenantId;
          }
        } catch {}
      }
    }

    if (!tenantId || !threadId) {
      return res.status(400).json({ message: "tenantId and threadId are required" });
    }

    const isStaff = req.user?.role === "STAFF";
    const isOwner = !isStaff && (req.user?.role === "OWNER" || req.user?.role === "BUSINESS_OWNER" || !!req.user?.tenantId);
    const readByType = isStaff ? "STAFF" : (isOwner ? "OWNER" : "CUSTOMER");

    const result = await chatService.markAsRead({
      tenantId,
      threadId,
      readByType,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
