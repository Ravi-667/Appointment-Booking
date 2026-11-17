function requestLogger(req, res, next) {
  const start = Date.now();
  const { method, originalUrl } = req;

  // Don't log static assets spam
  if (originalUrl.startsWith("/css") || originalUrl.startsWith("/js") || originalUrl.startsWith("/uploads")) {
    return next();
  }

  res.on("finish", () => {
    const duration = Date.now() - start;
    const { statusCode } = res;
    const color = statusCode >= 500 ? "\x1b[31m" : statusCode >= 400 ? "\x1b[33m" : statusCode >= 300 ? "\x1b[36m" : "\x1b[32m";
    const reset = "\x1b[0m";

    console.log(`[HTTP] ${method} ${originalUrl} -> ${color}${statusCode}${reset} (${duration}ms)`);
  });

  next();
}

module.exports = { requestLogger };
