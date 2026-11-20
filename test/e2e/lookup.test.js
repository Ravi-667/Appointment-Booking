require("dotenv").config();
const request = require("supertest");
const app = require("../../src/app");
const prisma = require("../../src/utils/prisma.client");

describe("Customer Booking Lookup API & View", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("GET /my-bookings should render the My Bookings portal with status 200", async () => {
    const res = await request(app).get("/my-bookings");
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain("My Bookings");
  });

  it("GET /lookup should render or redirect to the My Bookings portal", async () => {
    const res = await request(app).get("/lookup");
    expect([200, 301, 302]).toContain(res.statusCode);
  });

  it("GET /api/v1/bookings/my-bookings should return empty bookings when no email provided", async () => {
    const res = await request(app).get("/api/v1/bookings/my-bookings");
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ upcoming: [], past: [], total: 0 });
  });

  it("GET /api/v1/bookings/my-bookings should return customer appointments for matching email", async () => {
    jest.spyOn(prisma.booking, "findMany").mockResolvedValue([
      {
        id: "b-1",
        customerName: "Ravi",
        customerEmail: "ravi@example.com",
        status: "CONFIRMED",
        startTime: new Date(Date.now() + 86400000), // tomorrow
        price: 999.0,
        tenant: { name: "Radha Beauty Salon", slug: "radha-beauty-salon" },
        service: { name: "Herbal Facial", durationMinutes: 45 },
        staff: { name: "Priya" },
        payments: [],
      },
    ]);

    const res = await request(app)
      .get("/api/v1/bookings/my-bookings")
      .query({ email: "ravi@example.com" });

    expect(res.statusCode).toBe(200);
    expect(res.body.upcoming.length).toBe(1);
    expect(res.body.upcoming[0].customerName).toBe("Ravi");
    expect(res.body.upcoming[0].tenant.name).toBe("Radha Beauty Salon");
  });

  it("GET /api/v1/bookings/lookup should require both id and email query params", async () => {
    const res = await request(app).get("/api/v1/bookings/lookup");
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toContain("id and email are required");
  });

  it("GET /api/v1/bookings/lookup should return booking details when ID and email match", async () => {
    jest.spyOn(prisma.booking, "findFirst").mockResolvedValue({
      id: "b-123",
      customerName: "John Doe",
      customerEmail: "john@example.com",
      status: "CONFIRMED",
      startTime: new Date("2026-11-20T10:00:00Z"),
      price: 500.0,
      service: { name: "Haircut" },
      staff: { name: "Priya" },
    });

    const res = await request(app)
      .get("/api/v1/bookings/lookup")
      .query({ id: "b-123", email: "john@example.com" });

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("id", "b-123");
    expect(res.body.customerName).toBe("John Doe");
    expect(res.body.status).toBe("CONFIRMED");
    expect(res.body.service.name).toBe("Haircut");
  });

  it("GET /api/v1/bookings/lookup should return 404 when no matching booking found", async () => {
    jest.spyOn(prisma.booking, "findFirst").mockResolvedValue(null);

    const res = await request(app)
      .get("/api/v1/bookings/lookup")
      .query({ id: "non-existent-id", email: "wrong@example.com" });

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toContain("Booking not found");
  });
});
