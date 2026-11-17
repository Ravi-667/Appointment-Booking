const rateLimit = require("express-rate-limit");

const globalLimiter = rateLimit({
  windowMs: 60 * 1000, max: 100,
  message: { statusCode: 429, message: "Too many requests" },
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000, max: 10,
  message: { statusCode: 429, message: "Too many login attempts" },
});

const bookingLimiter = rateLimit({
  windowMs: 60 * 1000, max: 20,
  message: { statusCode: 429, message: "Too many booking requests" },
});

module.exports = { globalLimiter, authLimiter, bookingLimiter };

