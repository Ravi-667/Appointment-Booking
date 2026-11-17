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
const { globalLimiter } = require("./middlewares/rate-limit.middleware");
const { requestLogger } = require("./middlewares/logger.middleware");

const app = express();

app.use(requestLogger);

// ─── Security ───────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.tailwindcss.com"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"],
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
// Raw body for Razorpay webhook BEFORE json middleware
app.use("/api/v1/payments/webhook", express.raw({ type: "application/json" }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ─── Session + Flash ────────────────────────────────────────────────────────
app.use(session({
  secret: process.env.JWT_ACCESS_SECRET || "dev-session-secret-replace-me",
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === "production", maxAge: 24 * 60 * 60 * 1000 }, // 24h
}));
app.use(flash());

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
const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.0",
    info: { title: "Appointment Booking API", version: "1.0.0", description: "Production-grade booking platform" },
    servers: [{ url: "/api/v1" }],
    components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } } },
  },
  apis: ["./src/routes/*.js"],
});
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ─── Health ─────────────────────────────────────────────────────────────────
app.get("/api/v1/health", (req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

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

// ─── View Routes (EJS pages) ────────────────────────────────────────────────
app.use("/", require("./routes/views.routes"));

// ─── 404 handler ────────────────────────────────────────────────────────────
app.use((req, res) => {
  // For API requests return JSON, for browser requests render a page
  if (req.url.startsWith("/api/")) {
    return res.status(404).json({ statusCode: 404, message: `Route ${req.url} not found` });
  }
  res.status(404).render("home", { title: "Not Found" });
});

// ─── Global error handler — MUST be last ────────────────────────────────────
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal server error";
  if (status >= 500) console.error(`[ERROR] ${req.method} ${req.url}:`, err);

  // For API requests return JSON
  if (req.url.startsWith("/api/")) {
    return res.status(status).json({ statusCode: status, message, path: req.url, timestamp: new Date().toISOString() });
  }
  // For view routes, flash error and redirect back
  req.flash("error", message);
  res.redirect("back");
});

module.exports = app;
