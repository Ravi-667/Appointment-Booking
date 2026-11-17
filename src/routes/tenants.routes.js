const router = require("express").Router();
const { z } = require("zod");
const tenantsService = require("../services/tenants.service");
const { authenticate } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const { validate } = require("../middlewares/validate.middleware");

const createTenantSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  category: z.string().optional(),
  phone: z.string().optional(),
  timezone: z.string().optional(),
});

router.post("/", authenticate, requireRole("BUSINESS_OWNER"), validate(createTenantSchema), async (req, res, next) => {
  try { res.status(201).json(await tenantsService.create(req.body, req.user.id)); } catch (e) { next(e); }
});

router.get("/slug/:slug", async (req, res, next) => {
  try { res.json(await tenantsService.findBySlug(req.params.slug)); } catch (e) { next(e); }
});

router.get("/:id", authenticate, async (req, res, next) => {
  try { res.json(await tenantsService.findOne(req.params.id)); } catch (e) { next(e); }
});

router.patch("/:id", authenticate, requireRole("BUSINESS_OWNER"), async (req, res, next) => {
  try { res.json(await tenantsService.update(req.params.id, req.body)); } catch (e) { next(e); }
});

router.put("/:id/hours", authenticate, requireRole("BUSINESS_OWNER"), async (req, res, next) => {
  try { res.json(await tenantsService.updateBusinessHours(req.params.id, req.body.hours)); } catch (e) { next(e); }
});

router.post("/:id/holidays", authenticate, requireRole("BUSINESS_OWNER"), async (req, res, next) => {
  try { res.status(201).json(await tenantsService.addHoliday(req.params.id, req.body.date, req.body.reason)); } catch (e) { next(e); }
});

router.delete("/:id/holidays/:holidayId", authenticate, requireRole("BUSINESS_OWNER"), async (req, res, next) => {
  try { await tenantsService.removeHoliday(req.params.id, req.params.holidayId); res.json({ message: "Holiday removed" }); } catch (e) { next(e); }
});

module.exports = router;

