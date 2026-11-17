function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ statusCode: 401, message: "Not authenticated" });
    if (!roles.includes(req.user.role)) return res.status(403).json({ statusCode: 403, message: "Insufficient permissions" });
    next();
  };
}

module.exports = { requireRole };

