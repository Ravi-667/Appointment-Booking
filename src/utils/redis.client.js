const Redis = require("ioredis");

const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  lazyConnect: true,
});

redis.on("error", (err) => console.error("Redis error:", err.message));
redis.on("connect", () => console.log("✓ Redis connected"));

module.exports = redis;

