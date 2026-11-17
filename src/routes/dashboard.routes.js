const router = require("express").Router();
const dashboardService = require("../services/dashboard.service");
const { authenticate } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");

router.get("/stats", authenticate, requireRole("BUSINESS_OWNER", "PLATFORM_ADMIN"), async (req, res, next) => {
  try { res.json(await dashboardService.getStats(req.user.tenantId, req.query.period)); } catch (e) { next(e); }
});

router.get("/calendar", authenticate, requireRole("BUSINESS_OWNER", "STAFF"), async (req, res, next) => {
  try {
    const date = req.query.date || new Date().toISOString().split("T")[0];
    res.json(await dashboardService.getCalendar(req.user.tenantId, date));
  } catch (e) { next(e); }
});

router.get("/upcoming", authenticate, requireRole("BUSINESS_OWNER", "STAFF"), async (req, res, next) => {
  try { res.json(await dashboardService.getUpcoming(req.user.tenantId, req.query.limit)); } catch (e) { next(e); }
});

router.get("/notifications", authenticate, requireRole("BUSINESS_OWNER"), async (req, res, next) => {
  try { res.json(await dashboardService.getNotificationLogs(req.user.tenantId, req.query.page, req.query.limit)); } catch (e) { next(e); }
});

module.exports = router;

