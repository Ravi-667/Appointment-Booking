require("dotenv").config();
const crypto = require("crypto");
const prisma = require("../../src/utils/prisma.client");
const paymentsService = require("../../src/services/payments.service");
const notificationsService = require("../../src/services/notifications.service");
const kafka = require("../../src/utils/kafka.client");

describe("PaymentsService - Full Payment & Razorpay Flow", () => {
  beforeEach(() => {
    jest.spyOn(notificationsService, "notifyBookingConfirmed").mockResolvedValue();
    if (prisma.inAppNotification) {
      jest.spyOn(prisma.inAppNotification, "create").mockResolvedValue({});
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("createOrder", () => {
    it("should calculate amount based on full service price in paise and record FULL_PAYMENT", async () => {
      const mockBooking = {
        id: "b-test-1",
        tenantId: "t-test-1",
        price: 999.00,
        depositAmount: 999.00,
        status: "PENDING_PAYMENT",
        customerName: "Rahul Sharma",
        customerEmail: "rahul@example.com",
        customerPhone: "+919876543210",
        service: { name: "Full Body Massage", price: 999.00 },
        tenant: { name: "Spa Salon" },
      };

      jest.spyOn(prisma.booking, "findFirst").mockResolvedValue(mockBooking);
      jest.spyOn(prisma, "$transaction").mockResolvedValue([{}, {}]);

      const result = await paymentsService.createOrder("b-test-1");

      // Full payment check: 999 INR * 100 = 99900 paise
      expect(result.amount).toBe(99900);
      expect(result.currency).toBe("INR");
      expect(result.bookingId).toBe("b-test-1");
      expect(result.businessName).toBe("Spa Salon");
      expect(result.serviceName).toBe("Full Body Massage");
    });

    it("should reject order creation if booking is not in PENDING_PAYMENT or PAYMENT_FAILED", async () => {
      const mockBooking = {
        id: "b-test-2",
        status: "CONFIRMED",
        price: 500,
      };

      jest.spyOn(prisma.booking, "findFirst").mockResolvedValue(mockBooking);

      await expect(paymentsService.createOrder("b-test-2")).rejects.toThrow("Booking is already CONFIRMED");
    });
  });

  describe("verifyPayment", () => {
    it("should verify HMAC SHA256 signature and confirm booking", async () => {
      const bookingId = "b-verify-1";
      const razorpayOrderId = "order_12345";
      const razorpayPaymentId = "pay_67890";
      const secret = process.env.RAZORPAY_KEY_SECRET || "placeholder";
      const validSignature = crypto
        .createHmac("sha256", secret)
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest("hex");

      const mockPayment = { id: "p-1", bookingId, razorpayOrderId, status: "PENDING" };
      const mockBooking = {
        id: bookingId,
        tenantId: "t-1",
        customerEmail: "john@example.com",
        customerName: "John Doe",
        startTime: new Date(),
        status: "CONFIRMED",
      };

      jest.spyOn(prisma.payment, "findFirst").mockResolvedValue(mockPayment);
      jest.spyOn(prisma, "$transaction").mockResolvedValue([{}, {}]);
      jest.spyOn(prisma.booking, "findUnique").mockResolvedValue(mockBooking);
      jest.spyOn(kafka, "publish").mockResolvedValue();

      const result = await paymentsService.verifyPayment({
        bookingId,
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature: validSignature,
      });

      expect(result.success).toBe(true);
      expect(result.paymentId).toBe(razorpayPaymentId);
      expect(result.booking.status).toBe("CONFIRMED");
    });

    it("should support simulation signature when in test placeholder mode", async () => {
      const bookingId = "b-sim-1";
      const razorpayOrderId = "order_sim_123";
      const razorpayPaymentId = "pay_sim_456";
      const simSignature = "sim_sig_test";

      const mockPayment = { id: "p-2", bookingId, razorpayOrderId, status: "PENDING" };
      const mockBooking = { id: bookingId, tenantId: "t-1", status: "CONFIRMED" };

      jest.spyOn(prisma.payment, "findFirst").mockResolvedValue(mockPayment);
      jest.spyOn(prisma, "$transaction").mockResolvedValue([{}, {}]);
      jest.spyOn(prisma.booking, "findUnique").mockResolvedValue(mockBooking);
      jest.spyOn(kafka, "publish").mockResolvedValue();

      const result = await paymentsService.verifyPayment({
        bookingId,
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature: simSignature,
      });

      expect(result.success).toBe(true);
      expect(result.paymentId).toBe(razorpayPaymentId);
    });
  });

  describe("verifyUpiPayment", () => {
    it("should generate valid HMAC signature and confirm UPI payment", async () => {
      const bookingId = "b-upi-1";
      const razorpayOrderId = "order_upi_12345";
      const mockBooking = {
        id: bookingId,
        tenantId: "t-1",
        customerEmail: "upi@example.com",
        customerName: "UPI User",
        startTime: new Date(),
        status: "CONFIRMED",
        razorpayOrderId,
      };
      const mockPayment = { id: "p-upi", bookingId, razorpayOrderId, status: "PENDING" };

      jest.spyOn(prisma.booking, "findUnique").mockResolvedValue(mockBooking);
      jest.spyOn(prisma.payment, "findFirst").mockResolvedValue(mockPayment);
      jest.spyOn(prisma, "$transaction").mockResolvedValue([{}, {}]);
      jest.spyOn(kafka, "publish").mockResolvedValue();

      const result = await paymentsService.verifyUpiPayment({
        bookingId,
        razorpayOrderId,
        upiId: "success@razorpay",
      });

      expect(result.success).toBe(true);
      expect(result.paymentId).toMatch(/^pay_upi_/);
      expect(result.booking.status).toBe("CONFIRMED");
    });
  });

  describe("handleWebhook", () => {
    it("should reject invalid webhook signature with 400", async () => {
      await expect(
        paymentsService.handleWebhook(Buffer.from(JSON.stringify({ event: "payment.captured" })), "invalid_sig")
      ).rejects.toThrow("Invalid webhook signature");
    });
  });
});
