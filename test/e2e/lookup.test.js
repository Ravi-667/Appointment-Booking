require("dotenv").config();
const request = require("supertest");
const app = require("../../src/app");
const prisma = require("../../src/utils/prisma.client");

describe("Customer Booking Lookup API & View", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("GET /lookup should render the public tracking page with status 200", async () => {
    const res = await request(app).get("/lookup");
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain("Track Your Booking");
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
