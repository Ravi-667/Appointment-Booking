const router = require("express").Router();
const { z } = require("zod");
const authService = require("../services/auth.service");
const { authenticate } = require("../middlewares/auth.middleware");
const { authLimiter } = require("../middlewares/rate-limit.middleware");
const { validate } = require("../middlewares/validate.middleware");

const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).regex(/^(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])/, {
    message: "Password needs uppercase, number and special character",
  }),
  role: z.enum(["BUSINESS_OWNER", "CUSTOMER"]),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post("/register", authLimiter, validate(registerSchema), async (req, res, next) => {
  try { res.status(201).json(await authService.register(req.body)); } catch (e) { next(e); }
});

router.post("/login", authLimiter, validate(loginSchema), async (req, res, next) => {
  try { res.json(await authService.login(req.body.email, req.body.password)); } catch (e) { next(e); }
});

router.post("/refresh", authenticate, async (req, res, next) => {
  try { res.json(await authService.refresh(req.user.id, req.body.refreshToken)); } catch (e) { next(e); }
});

router.get("/me", authenticate, async (req, res, next) => {
  try { res.json(await authService.getMe(req.user.id)); } catch (e) { next(e); }
});

router.post("/forgot-password", authLimiter, async (req, res, next) => {
  try { res.json(await authService.forgotPassword(req.body.email)); } catch (e) { next(e); }
});

router.post("/reset-password", async (req, res, next) => {
  try { res.json(await authService.resetPassword(req.body.token, req.body.password)); } catch (e) { next(e); }
});

module.exports = router;

