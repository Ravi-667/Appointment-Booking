const router = require("express").Router();
const staffService = require("../services/staff.service");
const { authenticate } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");

// Candidate public application via API
router.post("/apply", async (req, res, next) => {
  try {
    const { tenantId, slug, ...data } = req.body;
    let targetTenantId = tenantId;
    if (!targetTenantId && slug) {
      const tenantsService = require("../services/tenants.service");
      const tenant = await tenantsService.findBySlug(slug);
      targetTenantId = tenant.id;
    }
    if (!targetTenantId) {
      return res.status(400).json({ error: "tenantId or slug is required" });
    }
    const application = await staffService.applyForStaff(targetTenantId, data);
    res.status(201).json(application);
  } catch (e) {
    next(e);
  }
});

// Owner applications endpoints (must be defined before /:id)
router.get("/applications", authenticate, requireRole("BUSINESS_OWNER"), async (req, res, next) => {
  try {
    const { status } = req.query;
    res.json(await staffService.getApplications(req.user.tenantId, status));
  } catch (e) {
    next(e);
  }
});

router.post("/applications/:id/accept", authenticate, requireRole("BUSINESS_OWNER"), async (req, res, next) => {
  try {
    res.json(await staffService.acceptApplication(req.user.tenantId, req.params.id, req.body));
  } catch (e) {
    next(e);
  }
});

router.post("/applications/:id/reject", authenticate, requireRole("BUSINESS_OWNER"), async (req, res, next) => {
  try {
    res.json(await staffService.rejectApplication(req.user.tenantId, req.params.id, req.body?.notes));
  } catch (e) {
    next(e);
  }
});

// Staff CRUD
router.get("/", authenticate, async (req, res, next) => {
  try { res.json(await staffService.findAll(req.user.tenantId)); } catch (e) { next(e); }
});

router.post("/", authenticate, requireRole("BUSINESS_OWNER"), async (req, res, next) => {
  try { res.status(201).json(await staffService.create(req.user.tenantId, req.body)); } catch (e) { next(e); }
});

router.get("/:id", authenticate, async (req, res, next) => {
  try { res.json(await staffService.findOne(req.user.tenantId, req.params.id)); } catch (e) { next(e); }
});

router.post("/:id/credentials", authenticate, requireRole("BUSINESS_OWNER"), async (req, res, next) => {
  try {
    const originUrl = `${req.protocol}://${req.get("host")}`;
    const io = req.app.get("io");
    const result = await staffService.provisionStaffCredentials(
      req.user.tenantId,
      req.params.id,
      {
        email: req.body.email,
        password: req.body.password,
        io,
        originUrl,
      }
    );
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.patch("/:id", authenticate, requireRole("BUSINESS_OWNER"), async (req, res, next) => {
  try { res.json(await staffService.update(req.user.tenantId, req.params.id, req.body)); } catch (e) { next(e); }
});

router.delete("/:id", authenticate, requireRole("BUSINESS_OWNER"), async (req, res, next) => {
  try { res.json(await staffService.deactivate(req.user.tenantId, req.params.id)); } catch (e) { next(e); }
});

router.post("/:id/activate", authenticate, requireRole("BUSINESS_OWNER"), async (req, res, next) => {
  try { res.json(await staffService.activate(req.user.tenantId, req.params.id)); } catch (e) { next(e); }
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
