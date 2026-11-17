const Redis = require("ioredis");

function getRedisClient() {
  let url = process.env.REDIS_URL?.trim();
  if (url) {
    // Sanitize accidental prefixes like redis://redis:redis:// or redis://redis://
    while (url.startsWith("redis://redis:") || url.startsWith("redis://redis://")) {
      url = url.replace(/^redis:\/\/(?:redis:)?/, "");
    }
    if (!url.startsWith("redis://") && !url.startsWith("rediss://")) {
      url = `redis://${url}`;
    }
    return new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: null,
      retryStrategy(times) {
        return Math.min(times * 100, 3000);
      },
    });
  }

  return new Redis({
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
    lazyConnect: true,
    maxRetriesPerRequest: null,
    retryStrategy(times) {
      return Math.min(times * 100, 3000);
    },
  });
}

const redis = getRedisClient();

redis.on("error", (err) => console.error("Redis error:", err.message));
redis.on("connect", () => console.log("✓ Redis connected"));

module.exports = redis;
