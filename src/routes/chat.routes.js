const router = require("express").Router();
const chatService = require("../services/chat.service");
const prisma = require("../utils/prisma.client");

// Middleware to extract user from session or Bearer token if present
function optionalAuth(req, res, next) {
  if (req.session && req.session.user) {
    req.user = req.session.user;
  }
  next();
}

// Send a chat message
router.post("/messages", optionalAuth, async (req, res, next) => {
  try {
    const isOwner = req.user && req.user.tenantId;
    let tenantId = req.body.tenantId || (isOwner ? req.user.tenantId : null);

    // If tenantId missing but bookingId provided, look up booking
    if (!tenantId && req.body.bookingId) {
      const b = await prisma.booking.findUnique({ where: { id: req.body.bookingId } });
      if (b) tenantId = b.tenantId;
    }

    const payload = {
      tenantId,
      bookingId: req.body.bookingId || null,
      visitorEmail: req.body.visitorEmail || null,
      recipientEmail: req.body.recipientEmail || null,
      senderType: isOwner ? "OWNER" : (req.body.senderType || "VISITOR"),
      senderId: req.user ? req.user.id : null,
      senderName: isOwner ? req.user.name : req.body.senderName,
      senderEmail: isOwner ? req.user.email : req.body.senderEmail,
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
    const isOwner = req.user && req.user.tenantId;
    let tenantId = req.query.tenantId || (isOwner ? req.user.tenantId : null);
    const { threadId, bookingId, visitorEmail } = req.query;

    // If tenantId is not passed but bookingId or booking_ threadId is, resolve tenantId
    if (!tenantId && (bookingId || (threadId && threadId.startsWith("booking_")))) {
      const bId = bookingId || threadId.replace("booking_", "");
      const b = await prisma.booking.findUnique({ where: { id: bId } });
      if (b) tenantId = b.tenantId;
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
    if (!req.user || !req.user.tenantId) {
      return res.status(401).json({ message: "Owner authentication required" });
    }

    const threads = await chatService.getThreadsForTenant(req.user.tenantId);
    res.json(threads);
  } catch (err) {
    next(err);
  }
});

// Mark a conversation thread as read
router.patch("/read", optionalAuth, async (req, res, next) => {
  try {
    const isOwner = req.user && req.user.tenantId;
    let tenantId = req.body.tenantId || (isOwner ? req.user.tenantId : null);
    const { threadId } = req.body;

    if (!tenantId && threadId && threadId.startsWith("booking_")) {
      const b = await prisma.booking.findUnique({ where: { id: threadId.replace("booking_", "") } });
      if (b) tenantId = b.tenantId;
    }

    if (!tenantId || !threadId) {
      return res.status(400).json({ message: "tenantId and threadId are required" });
    }

    const result = await chatService.markAsRead({
      tenantId,
      threadId,
      readByType: isOwner ? "OWNER" : "CUSTOMER",
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
