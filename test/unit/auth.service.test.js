require("dotenv").config();
const prisma = require("../../src/utils/prisma.client");
const authService = require("../../src/services/auth.service");
const bcrypt = require("bcrypt");

describe("AuthService Unit Tests", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should fail login when user is not found", async () => {
    jest.spyOn(prisma.user, "findFirst").mockResolvedValue(null);

    await expect(authService.login("nonexistent@example.com", "wrongpass")).rejects.toThrow(
      "Invalid credentials"
    );
  });

  it("should fail login when user is deactivated", async () => {
    jest.spyOn(prisma.user, "findFirst").mockResolvedValue({
      id: "u1",
      email: "user@example.com",
      passwordHash: await bcrypt.hash("Password@123", 10),
      emailVerified: true,
      isActive: false,
    });

    await expect(authService.login("user@example.com", "Password@123")).rejects.toThrow(
      "Account deactivated"
    );
  });

  it("should succeed forgot password when user exists", async () => {
    jest.spyOn(prisma.user, "findFirst").mockResolvedValue({ id: "u1", email: "user@example.com" });
    jest.spyOn(prisma.user, "update").mockResolvedValue({});

    const res = await authService.forgotPassword("user@example.com");
    expect(res).toHaveProperty("message");
  });

  it("should reject invalid reset tokens", async () => {
    jest.spyOn(prisma.user, "findFirst").mockResolvedValue(null);

    await expect(authService.resetPassword("invalid-token", "NewPass@123")).rejects.toThrow(
      "Invalid or expired reset token"
    );
  });
});
