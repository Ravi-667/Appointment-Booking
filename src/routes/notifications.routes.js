const router = require("express").Router();
const notificationsService = require("../services/notifications.service");

function resolveUser(req) {
  if (req.session && req.session.user) {
    return req.session.user;
  }
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) {
    try {
      const { verifyAccessToken } = require("../utils/jwt.utils");
      const payload = verifyAccessToken(auth.split(" ")[1]);
      return { id: payload.sub, email: payload.email, role: payload.role, tenantId: payload.tenantId };
    } catch {}
  }
  return null;
}

// GET /api/v1/notifications — List notifications & unread count
router.get("/", async (req, res, next) => {
  try {
    const user = resolveUser(req);
    const queryEmail = req.query.email ? req.query.email.toLowerCase().trim() : null;
    const limit = parseInt(req.query.limit) || 20;
    const unreadOnly = req.query.unreadOnly === "true";

    let tenantId = null;
    let userEmail = queryEmail;
    let userId = null;

    if (user) {
      if (user.tenantId) tenantId = user.tenantId;
      if (!userEmail && user.email) userEmail = user.email.toLowerCase().trim();
      userId = user.id;
    }

    if (!tenantId && !userEmail && !userId) {
      return res.json({ notifications: [], unreadCount: 0 });
    }

    const result = await notificationsService.getInAppNotifications({
      tenantId,
      userEmail,
      userId,
      limit,
      unreadOnly,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/notifications/:id/read — Mark single notification as read
router.patch("/:id/read", async (req, res, next) => {
  try {
    const updated = await notificationsService.markAsRead(req.params.id);
    res.json({ success: true, notification: updated });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/notifications/mark-all-read — Mark all notifications as read
router.post("/mark-all-read", async (req, res, next) => {
  try {
    const user = resolveUser(req);
    const queryEmail = req.body.email ? req.body.email.toLowerCase().trim() : null;

    let tenantId = user?.tenantId || null;
    let userEmail = queryEmail || (user?.email ? user.email.toLowerCase().trim() : null);
    let userId = user?.id || null;

    if (!tenantId && !userEmail && !userId) {
      return res.status(400).json({ error: "No user or tenant identifier provided" });
    }

    await notificationsService.markAllAsRead({ tenantId, userEmail, userId });
    res.json({ success: true, message: "All notifications marked as read" });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/notifications/:id — Dismiss/delete notification
router.delete("/:id", async (req, res, next) => {
  try {
    await notificationsService.deleteInApp(req.params.id);
    res.json({ success: true, message: "Notification dismissed" });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
