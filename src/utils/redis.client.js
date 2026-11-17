const Redis = require("ioredis");

const redis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, { lazyConnect: true })
  : new Redis({
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379"),
      lazyConnect: true,
    });

redis.on("error", (err) => console.error("Redis error:", err.message));
redis.on("connect", () => console.log("✓ Redis connected"));

module.exports = redis;

