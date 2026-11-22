require("dotenv").config();
const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const session = require("express-session");
const flash = require("connect-flash");
const cookieParser = require("cookie-parser");
const expressLayouts = require("express-ejs-layouts");
const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");
const passport = require("./utils/passport");
const { globalLimiter } = require("./middlewares/rate-limit.middleware");
const { requestLogger } = require("./middlewares/logger.middleware");

const app = express();

// ─── Trust Render / Heroku reverse proxy ────────────────────────────────────
// Required so that session cookies with `secure: true` work correctly on
// Render.com (and any platform that terminates TLS at the load-balancer).
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use(requestLogger);

// ─── Security ───────────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.tailwindcss.com", "https://checkout.razorpay.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "http:"],
      connectSrc: ["'self'", "ws:", "wss:", "https://api.razorpay.com", "https://lumberjack.razorpay.com", "https://*.razorpay.com"],
      frameSrc: ["'self'", "https://api.razorpay.com", "https://checkout.razorpay.com"],
    },
  },
}));
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(",") || "*", credentials: true }));

// ─── View Engine (EJS) ─────────────────────────────────────────────────────
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(expressLayouts);
app.set("layout", "layout");
app.set("layout extractScripts", true);

// ─── Static files ───────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "public")));

// ─── Body parsing ───────────────────────────────────────────────────────────
app.use("/api/v1/payments/webhook", express.raw({ type: "application/json" }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ─── Session + Flash ────────────────────────────────────────────────────────
app.use(session({
  secret: process.env.JWT_ACCESS_SECRET || "dev-session-secret-replace-me",
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === "production", maxAge: 24 * 60 * 60 * 1000 },
}));
app.use(flash());

// ─── Passport (Google OAuth) ────────────────────────────────────────────────
app.use(passport.initialize());
app.use(passport.session());

// ─── Template locals (available in all views) ───────────────────────────────
const dateTimeUtils = require("./utils/datetime.utils");
app.use((req, res, next) => {
  res.locals.user = req.session?.user || null;
  res.locals.messages = {
    success: req.flash("success")[0],
    error: req.flash("error")[0],
  };
  res.locals.formatTime12 = dateTimeUtils.formatTime12;
  res.locals.formatDate12 = dateTimeUtils.formatDate12;
  res.locals.formatDateTime12 = dateTimeUtils.formatDateTime12;
  res.locals.formatTimeRange12 = dateTimeUtils.formatTimeRange12;
  next();
});

// ─── Rate limiting ──────────────────────────────────────────────────────────
app.use(globalLimiter);

// ─── Swagger ────────────────────────────────────────────────────────────────
const swaggerSpec = require("./utils/swagger.doc");
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: "Appointment Booking API Documentation",
}));

// ─── Health & Keep-Alive ────────────────────────────────────────────────────
app.get("/api/v1/health", async (req, res) => {
  const checkDb = req.query.db === "true" || req.query.db === "1";
  let dbStatus = "skipped";
  let redisStatus = "skipped";

  if (checkDb) {
    try {
      const prisma = require("./utils/prisma.client");
      await prisma.$queryRaw`SELECT 1`;
      dbStatus = "connected";
    } catch (err) {
      dbStatus = "error: " + err.message;
    }
  }

  if (req.query.redis === "true") {
    try {
      const redis = require("./utils/redis.client");
      if (redis.status === "ready") {
        await redis.ping();
        redisStatus = "connected";
      } else {
        redisStatus = redis.status;
      }
    } catch (err) {
      redisStatus = "error: " + err.message;
    }
  }

  res.status(200).json({
    status: "ok",
    uptime: Math.floor(process.uptime()),
    database: dbStatus,
    redis: redisStatus,
    timestamp: new Date().toISOString(),
  });
});

// ─── API Routes ─────────────────────────────────────────────────────────────
app.use("/api/v1/auth",         require("./routes/auth.routes"));
app.use("/api/v1/tenants",      require("./routes/tenants.routes"));
app.use("/api/v1/services",     require("./routes/services.routes"));
app.use("/api/v1/staff",        require("./routes/staff.routes"));
app.use("/api/v1/availability", require("./routes/availability.routes"));
app.use("/api/v1/bookings",     require("./routes/bookings.routes"));
app.use("/api/v1/payments",     require("./routes/payments.routes"));
app.use("/api/v1/dashboard",    require("./routes/dashboard.routes"));
app.use("/api/v1/uploads",      require("./routes/uploads.routes"));
app.use("/api/v1/chat",         require("./routes/chat.routes"));
app.use("/api/v1/notifications", require("./routes/notifications.routes"));

// ─── View Routes (EJS pages) ────────────────────────────────────────────────
app.use("/", require("./routes/views.routes"));
app.use("/", require("./routes/staff-portal.routes"));

// ─── 404 handler ────────────────────────────────────────────────────────────
app.use((req, res) => {
  if (req.url.startsWith("/api/")) {
    return res.status(404).json({ statusCode: 404, message: `Route ${req.url} not found` });
  }
  res.status(404).render("home", { title: "Not Found" });
});

// ─── Global error handler ────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal server error";
  if (status >= 500) console.error(`[ERROR] ${req.method} ${req.url}:`, err);

  if (req.url.startsWith("/api/")) {
    return res.status(status).json({ statusCode: status, message, path: req.url, timestamp: new Date().toISOString() });
  }
  req.flash("error", message);
  res.redirect("back");
});

module.exports = app;
