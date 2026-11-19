const router = require("express").Router();
const paymentsService = require("../services/payments.service");
const { authenticate } = require("../middlewares/auth.middleware");

// Customer or tenant order creation for a booking
router.post("/order/:bookingId", async (req, res, next) => {
  try {
    const tenantId = req.user?.tenantId || null;
    res.json(await paymentsService.createOrder(req.params.bookingId, tenantId));
  } catch (e) {
    next(e);
  }
});

// Client-side verification fallback (verifies Razorpay signature immediately)
router.post("/verify", async (req, res, next) => {
  try {
    const { bookingId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
    res.json(await paymentsService.verifyPayment({ bookingId, razorpayOrderId, razorpayPaymentId, razorpaySignature }));
  } catch (e) {
    next(e);
  }
});

// Webhook — NO auth guard, raw body set in app.js
router.post("/webhook/razorpay", async (req, res, next) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const result = await paymentsService.handleWebhook(req.body, signature);
    res.json(result);
  } catch (e) {
    next(e);
  }
});

router.post("/:bookingId/refund", authenticate, async (req, res, next) => {
  try {
    res.json(await paymentsService.initiateRefund(req.params.bookingId, req.user.tenantId));
  } catch (e) {
    next(e);
  }
});

module.exports = router;
