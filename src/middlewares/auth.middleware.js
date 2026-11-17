const { verifyAccessToken } = require("../utils/jwt.utils");
const prisma = require("../utils/prisma.client");

async function authenticate(req, res, next) {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) {
      return res.status(401).json({ statusCode: 401, message: "No token provided" });
    }
    const payload = verifyAccessToken(auth.split(" ")[1]);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, tenantId: true, isActive: true },
    });
    if (!user || !user.isActive) {
      return res.status(401).json({ statusCode: 401, message: "User not found or deactivated" });
    }
    req.user = user;
    next();
  } catch {
    res.status(401).json({ statusCode: 401, message: "Invalid or expired token" });
  }
}

module.exports = { authenticate };

