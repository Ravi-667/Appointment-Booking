require("dotenv").config();
const request = require("supertest");
const app = require("../../src/app");
const { signAccessToken } = require("../../src/utils/jwt.utils");
const prisma = require("../../src/utils/prisma.client");
const bcrypt = require("bcrypt");

describe("Password Change API", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("POST /api/v1/auth/change-password should return 401 without auth", async () => {
    const res = await request(app)
      .post("/api/v1/auth/change-password")
      .send({ currentPassword: "OldPassword@1", newPassword: "NewPassword@1" });
    expect(res.statusCode).toBe(401);
  });

  it("POST /api/v1/auth/change-password should validate password complexity (reject weak new password)", async () => {
    const token = signAccessToken({ sub: "user-1", email: "user@test.com", role: "CUSTOMER" });
    jest.spyOn(prisma.user, "findUnique").mockResolvedValue({ id: "user-1", email: "user@test.com", isActive: true });

    const res = await request(app)
      .post("/api/v1/auth/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "OldPassword@1", newPassword: "weak" });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("Validation failed");
  });

  it("POST /api/v1/auth/change-password should change password successfully when current matches", async () => {
    const token = signAccessToken({ sub: "user-1", email: "user@test.com", role: "CUSTOMER" });
    const currentHash = await bcrypt.hash("OldPassword@1", 10);

    jest.spyOn(prisma.user, "findUnique").mockResolvedValue({
      id: "user-1",
      email: "user@test.com",
      passwordHash: currentHash,
      isActive: true,
    });

    const updateSpy = jest.spyOn(prisma.user, "update").mockResolvedValue({});

    const res = await request(app)
      .post("/api/v1/auth/change-password")
      .set("Authorization", `Bearer ${token}`)
      .send({ currentPassword: "OldPassword@1", newPassword: "NewSecurePassword@123" });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("Password changed successfully");
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: expect.objectContaining({
          passwordHash: expect.any(String),
        }),
      })
    );
  });
});
