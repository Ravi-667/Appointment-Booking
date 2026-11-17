const bcrypt = require("bcrypt");
const crypto = require("crypto");
const prisma = require("../utils/prisma.client");
const { signAccessToken, signRefreshToken } = require("../utils/jwt.utils");

function makeError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

class AuthService {
  async register({ name, email, password, role }) {
    const existing = await prisma.user.findFirst({ where: { email, tenantId: null } });
    if (existing) throw makeError("Email already registered", 409);

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name, email, passwordHash, role, emailVerified: true },
    });
    return { message: "Registration successful", userId: user.id };
  }

  async login(email, password) {
    const user = await prisma.user.findFirst({ where: { email, tenantId: null } });
    if (!user || !user.passwordHash) throw makeError("Invalid credentials", 401);
    if (!user.emailVerified) throw makeError("Please verify your email", 401);
    if (!user.isActive) throw makeError("Account deactivated", 401);

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw makeError("Invalid credentials", 401);

    const payload = { sub: user.id, email: user.email, role: user.role, tenantId: user.tenantId };
    return {
      accessToken: signAccessToken(payload),
      refreshToken: signRefreshToken(payload),
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    };
  }

  async refresh(userId, refreshToken) {
    const { verifyRefreshToken } = require("../utils/jwt.utils");
    try {
      const payload = verifyRefreshToken(refreshToken);
      if (payload.sub !== userId) throw makeError("Token mismatch", 401);
    } catch {
      throw makeError("Invalid refresh token", 401);
    }
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw makeError("User not found", 401);
    const payload = { sub: user.id, email: user.email, role: user.role, tenantId: user.tenantId };
    return { accessToken: signAccessToken(payload), refreshToken: signRefreshToken(payload) };
  }

  async getMe(userId) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true, tenantId: true, createdAt: true },
    });
  }

  async forgotPassword(email) {
    const user = await prisma.user.findFirst({ where: { email, tenantId: null } });
    if (!user) return { message: "If that email exists, a reset link has been sent." };
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordResetToken: tokenHash, passwordResetTokenExp: new Date(Date.now() + 3600000) },
    });
    console.log(`[DEV] Reset token for ${email}: ${token}`);
    return { message: "If that email exists, a reset link has been sent." };
  }

  async resetPassword(token, newPassword) {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const user = await prisma.user.findFirst({
      where: { passwordResetToken: tokenHash, passwordResetTokenExp: { gte: new Date() } },
    });
    if (!user) throw makeError("Invalid or expired reset token", 400);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(newPassword, 12), passwordResetToken: null, passwordResetTokenExp: null },
    });
    return { message: "Password reset successfully" };
  }

  async changePassword(userId, currentPassword, newPassword) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.passwordHash) throw makeError("User not found", 404);

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw makeError("Current password is incorrect", 400);

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return { message: "Password changed successfully" };
  }
}

module.exports = new AuthService();

