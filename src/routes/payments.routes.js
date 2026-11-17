const router = require("express").Router();
const paymentsService = require("../services/payments.service");
const { authenticate } = require("../middlewares/auth.middleware");

router.post("/order/:bookingId", authenticate, async (req, res, next) => {
  try { res.json(await paymentsService.createOrder(req.params.bookingId, req.user.tenantId)); } catch (e) { next(e); }
});

// Webhook — NO auth guard, raw body set in app.js
router.post("/webhook/razorpay", async (req, res, next) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const result = await paymentsService.handleWebhook(req.body, signature);
    res.json(result);
  } catch (e) { next(e); }
});

router.post("/:bookingId/refund", authenticate, async (req, res, next) => {
  try { res.json(await paymentsService.initiateRefund(req.params.bookingId, req.user.tenantId)); } catch (e) { next(e); }
});

module.exports = router;

