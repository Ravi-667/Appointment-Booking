const router = require("express").Router();
const { z } = require("zod");
const servicesService = require("../services/services.service");
const { authenticate } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const { validate } = require("../middlewares/validate.middleware");

const createServiceSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  durationMinutes: z.number().int().min(5).max(480),
  price: z.number().positive(),
  depositAmount: z.number().min(0).optional(),
  maxConcurrent: z.number().int().min(1).optional(),
});

router.get("/", authenticate, async (req, res, next) => {
  try { res.json(await servicesService.findAll(req.user.tenantId, req.query.activeOnly !== "false")); } catch (e) { next(e); }
});

router.post("/", authenticate, requireRole("BUSINESS_OWNER"), validate(createServiceSchema), async (req, res, next) => {
  try { res.status(201).json(await servicesService.create(req.user.tenantId, req.body)); } catch (e) { next(e); }
});

router.get("/:id", authenticate, async (req, res, next) => {
  try { res.json(await servicesService.findOne(req.user.tenantId, req.params.id)); } catch (e) { next(e); }
});

router.patch("/:id", authenticate, requireRole("BUSINESS_OWNER"), async (req, res, next) => {
  try { res.json(await servicesService.update(req.user.tenantId, req.params.id, req.body)); } catch (e) { next(e); }
});

router.delete("/:id", authenticate, requireRole("BUSINESS_OWNER"), async (req, res, next) => {
  try { res.json(await servicesService.remove(req.user.tenantId, req.params.id)); } catch (e) { next(e); }
});

router.post("/:id/staff/:staffId", authenticate, requireRole("BUSINESS_OWNER"), async (req, res, next) => {
  try { res.status(201).json(await servicesService.assignStaff(req.user.tenantId, req.params.id, req.params.staffId)); } catch (e) { next(e); }
});

router.delete("/:id/staff/:staffId", authenticate, requireRole("BUSINESS_OWNER"), async (req, res, next) => {
  try { await servicesService.removeStaff(req.params.id, req.params.staffId); res.json({ message: "Staff removed from service" }); } catch (e) { next(e); }
});

module.exports = router;

