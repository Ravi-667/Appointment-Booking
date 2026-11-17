require("dotenv").config();
const request = require("supertest");
const app = require("../../src/app");
const { signAccessToken } = require("../../src/utils/jwt.utils");
const prisma = require("../../src/utils/prisma.client");

describe("File Uploads API", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("POST /api/v1/uploads/logo should reject unauthenticated requests with 401", async () => {
    const res = await request(app).post("/api/v1/uploads/logo");
    expect(res.statusCode).toBe(401);
  });

  it("POST /api/v1/uploads/logo should accept valid image and return url", async () => {
    const token = signAccessToken({ sub: "user-1", email: "owner@salon.com", role: "BUSINESS_OWNER", tenantId: "tenant-1" });

    jest.spyOn(prisma.user, "findUnique").mockResolvedValue({
      id: "user-1",
      email: "owner@salon.com",
      role: "BUSINESS_OWNER",
      tenantId: "tenant-1",
      isActive: true,
    });

    jest.spyOn(prisma.tenant, "update").mockResolvedValue({});

    // 1x1 transparent PNG buffer
    const dummyImage = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

    const res = await request(app)
      .post("/api/v1/uploads/logo")
      .set("Authorization", `Bearer ${token}`)
      .attach("logo", dummyImage, "test-logo.png");

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("url");
    expect(res.body.url).toMatch(/^\/uploads\/logo-tenant-1-.*\.webp$/);
  });
});
