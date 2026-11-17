require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");
const { globalLimiter } = require("./middlewares/rate-limit.middleware");

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(",") || "*", credentials: true }));

// Raw body for Razorpay webhook BEFORE json middleware
app.use("/api/v1/payments/webhook", express.raw({ type: "application/json" }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(globalLimiter);

// Swagger
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

// Health
app.get("/api/v1/health", (req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

// Routes
app.use("/api/v1/auth",         require("./routes/auth.routes"));
app.use("/api/v1/tenants",      require("./routes/tenants.routes"));
app.use("/api/v1/services",     require("./routes/services.routes"));
app.use("/api/v1/staff",        require("./routes/staff.routes"));
app.use("/api/v1/availability", require("./routes/availability.routes"));
app.use("/api/v1/bookings",     require("./routes/bookings.routes"));
app.use("/api/v1/payments",     require("./routes/payments.routes"));
app.use("/api/v1/dashboard",    require("./routes/dashboard.routes"));

// 404
app.use((req, res) => res.status(404).json({ statusCode: 404, message: `Route ${req.url} not found` }));

// Global error handler — MUST be last
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal server error";
  if (status >= 500) console.error(`[ERROR] ${req.method} ${req.url}:`, err);
  res.status(status).json({ statusCode: status, message, path: req.url, timestamp: new Date().toISOString() });
});

module.exports = app;

