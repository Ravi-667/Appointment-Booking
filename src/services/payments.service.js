const crypto = require("crypto");
const Razorpay = require("razorpay");
const prisma = require("../utils/prisma.client");
const kafka = require("../utils/kafka.client");

function makeError(msg, status) { const e = new Error(msg); e.status = status; return e; }

class PaymentsService {
  constructor() {
    this.razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID || "rzp_test_placeholder",
      key_secret: process.env.RAZORPAY_KEY_SECRET || "placeholder",
    });
  }

  async createOrder(bookingId, tenantId) {
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, tenantId },
      include: { service: true },
    });
    if (!booking) throw makeError("Booking not found", 404);

    const amount = Math.round(Number(booking.depositAmount) * 100);

    const order = await this.razorpay.orders.create({
      amount,
      currency: "INR",
      receipt: bookingId,
      notes: { bookingId, tenantId },
    });

    await prisma.$transaction([
      prisma.booking.update({ where: { id: bookingId }, data: { razorpayOrderId: order.id } }),
      prisma.payment.create({
        data: { bookingId, tenantId, razorpayOrderId: order.id, amount: booking.depositAmount, currency: "INR", status: "PENDING", type: "DEPOSIT" },
      }),
    ]);

    return { orderId: order.id, amount, currency: "INR", bookingId };
  }

  async handleWebhook(rawBody, signature) {
    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET || "placeholder")
      .update(rawBody)
      .digest("hex");

    if (expected !== signature) throw makeError("Invalid webhook signature", 400);

    const event = JSON.parse(rawBody.toString());
    const eventId = event.payload?.payment?.entity?.id;

    // Idempotency check
    const existing = await prisma.payment.findFirst({ where: { webhookEventId: eventId } });
    if (existing) return { status: "already_processed" };

    if (event.event === "payment.captured") {
      await this._handleCaptured(event.payload.payment.entity, eventId);
    } else if (event.event === "payment.failed") {
      await this._handleFailed(event.payload.payment.entity, eventId);
    } else if (event.event === "refund.processed") {
      await this._handleRefund(event.payload.refund.entity);
    }

    return { status: "processed" };
  }

  async _handleCaptured(entity, eventId) {
    const payment = await prisma.payment.findFirst({ where: { razorpayOrderId: entity.order_id } });
    if (!payment) return;

    await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: { razorpayPaymentId: entity.id, status: "CAPTURED", webhookEventId: eventId },
      }),
      prisma.booking.update({ where: { id: payment.bookingId }, data: { status: "CONFIRMED" } }),
    ]);

    const booking = await prisma.booking.findUnique({ where: { id: payment.bookingId } });
    await kafka.publish("booking.confirmed", {
      bookingId: booking.id,
      tenantId: booking.tenantId,
      customerEmail: booking.customerEmail,
      customerName: booking.customerName,
      startTime: booking.startTime,
    }, booking.id);

    console.log(`✓ Booking confirmed: ${payment.bookingId}`);
  }

  async _handleFailed(entity, eventId) {
    const payment = await prisma.payment.findFirst({ where: { razorpayOrderId: entity.order_id } });
    if (!payment) return;
    await prisma.$transaction([
      prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED", webhookEventId: eventId } }),
      prisma.booking.update({ where: { id: payment.bookingId }, data: { status: "PAYMENT_FAILED" } }),
    ]);
  }

  async _handleRefund(entity) {
    await prisma.refund.updateMany({ where: { razorpayRefundId: entity.id }, data: { status: "PROCESSED" } });
  }

  async initiateRefund(bookingId, tenantId) {
    const booking = await prisma.booking.findFirst({ where: { id: bookingId, tenantId } });
    if (!booking) throw makeError("Booking not found", 404);

    const payment = await prisma.payment.findFirst({ where: { bookingId, status: "CAPTURED" } });
    if (!payment?.razorpayPaymentId) throw makeError("No captured payment found", 400);

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const hoursUntil = (new Date(booking.startTime).getTime() - Date.now()) / 3600000;
    const refundPct = hoursUntil < tenant.cancellationCutoffHours ? 0 : 100;
    const refundAmount = Number(payment.amount) * refundPct / 100;

    if (refundAmount === 0) return { message: "No refund applicable (within cancellation window)" };

    const refund = await this.razorpay.payments.refund(payment.razorpayPaymentId, {
      amount: Math.round(refundAmount * 100),
    });

    return prisma.refund.create({
      data: { paymentId: payment.id, razorpayRefundId: refund.id, amount: refundAmount, status: "PENDING", reason: `Cancellation (${refundPct}% refunded)` },
    });
  }
}

module.exports = new PaymentsService();

