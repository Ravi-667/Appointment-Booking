const router = require("express").Router();
const { z } = require("zod");
const bookingsService = require("../services/bookings.service");
const { authenticate } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const { validate } = require("../middlewares/validate.middleware");
const { bookingLimiter } = require("../middlewares/rate-limit.middleware");

const holdSchema = z.object({
  tenantId: z.string().uuid(),
  serviceId: z.string().uuid(),
  staffId: z.string().uuid().optional(),
  startTime: z.string().datetime(),
  customerName: z.string().optional(),
  customerEmail: z.string().email().optional(),
  customerPhone: z.string().optional(),
});

const createSchema = z.object({
  holdId: z.string().uuid(),
  sessionToken: z.string().min(1),
  customerName: z.string().optional(),
  customerEmail: z.string().email().optional(),
  customerPhone: z.string().optional(),
  notes: z.string().optional(),
});

router.post("/hold", bookingLimiter, validate(holdSchema), async (req, res, next) => {
  try { res.status(201).json(await bookingsService.holdSlot(req.body)); } catch (e) { next(e); }
});

router.post("/hold/release", async (req, res, next) => {
  try {
    const { holdId, sessionToken } = req.body;
    res.json(await bookingsService.releaseHold(holdId, sessionToken));
  } catch (e) { next(e); }
});

router.post("/", validate(createSchema), async (req, res, next) => {
  try {
    const { holdId, sessionToken, ...customerInfo } = req.body;
    res.status(201).json(await bookingsService.createBooking(holdId, sessionToken, customerInfo));
  } catch (e) { next(e); }
});

router.get("/", authenticate, async (req, res, next) => {
  try { res.json(await bookingsService.getBookings(req.user.tenantId, req.query)); } catch (e) { next(e); }
});

// Public booking lookup by ID + email (no auth needed)
router.get("/lookup", async (req, res, next) => {
  try {
    const { id, email } = req.query;
    if (!id || !email) return res.status(400).json({ message: "id and email are required" });
    const prisma = require("../utils/prisma.client");
    let booking;
    try {
      booking = await prisma.booking.findFirst({
        where: { id, customerEmail: email },
        include: { service: true, staff: true },
      });
    } catch {
      return res.status(404).json({ message: "Booking not found. Check your ID and email." });
    }
    if (!booking) return res.status(404).json({ message: "Booking not found. Check your ID and email." });
    res.json(booking);
  } catch (e) { next(e); }
});

router.get("/:id", authenticate, async (req, res, next) => {
  try { res.json(await bookingsService.getOne(req.user.tenantId, req.params.id)); } catch (e) { next(e); }
});

router.post("/:id/cancel", authenticate, async (req, res, next) => {
  try { res.json(await bookingsService.cancelBooking(req.user.tenantId, req.params.id, req.body.reason)); } catch (e) { next(e); }
});

router.post("/:id/no-show", authenticate, async (req, res, next) => {
  try { res.json(await bookingsService.markNoShow(req.user.tenantId, req.params.id)); } catch (e) { next(e); }
});

router.post("/:id/reschedule", authenticate, async (req, res, next) => {
  try { res.status(201).json(await bookingsService.reschedule(req.user.tenantId, req.params.id, req.body.newStartTime)); } catch (e) { next(e); }
});

module.exports = router;

