const router = require("express").Router();
const staffService = require("../services/staff.service");
const { authenticate } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");

router.get("/", authenticate, async (req, res, next) => {
  try { res.json(await staffService.findAll(req.user.tenantId)); } catch (e) { next(e); }
});

router.post("/", authenticate, requireRole("BUSINESS_OWNER"), async (req, res, next) => {
  try { res.status(201).json(await staffService.create(req.user.tenantId, req.body)); } catch (e) { next(e); }
});

router.get("/:id", authenticate, async (req, res, next) => {
  try { res.json(await staffService.findOne(req.user.tenantId, req.params.id)); } catch (e) { next(e); }
});

router.patch("/:id", authenticate, requireRole("BUSINESS_OWNER"), async (req, res, next) => {
  try { res.json(await staffService.update(req.user.tenantId, req.params.id, req.body)); } catch (e) { next(e); }
});

router.delete("/:id", authenticate, requireRole("BUSINESS_OWNER"), async (req, res, next) => {
  try { res.json(await staffService.deactivate(req.user.tenantId, req.params.id)); } catch (e) { next(e); }
});

router.put("/:id/schedule/:date", authenticate, requireRole("BUSINESS_OWNER"), async (req, res, next) => {
  try {
    const { isOff, startTime, endTime } = req.body;
    res.json(await staffService.setScheduleOverride(req.params.id, req.params.date, isOff, startTime, endTime));
  } catch (e) { next(e); }
});

router.delete("/:id/schedule/:date", authenticate, requireRole("BUSINESS_OWNER"), async (req, res, next) => {
  try { res.json(await staffService.removeScheduleOverride(req.params.id, req.params.date)); } catch (e) { next(e); }
});

module.exports = router;

