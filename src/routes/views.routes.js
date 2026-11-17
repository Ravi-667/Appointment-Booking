const router = require("express").Router();
const authService = require("../services/auth.service");
const tenantsService = require("../services/tenants.service");
const servicesService = require("../services/services.service");
const staffService = require("../services/staff.service");
const bookingsService = require("../services/bookings.service");
const dashboardService = require("../services/dashboard.service");
const prisma = require("../utils/prisma.client");

// ─── Auth helpers for view routes ───────────────────────────────────────────

function viewAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    req.flash("error", "Please log in to continue.");
    return res.redirect("/login");
  }
  req.user = req.session.user;
  next();
}

function requireTenant(req, res, next) {
  if (!req.user.tenantId) {
    return res.redirect("/setup");
  }
  next();
}

// ─── PUBLIC PAGES ───────────────────────────────────────────────────────────

router.get("/", async (req, res) => {
  try {
    const tenants = await prisma.tenant.findMany({
      where: { isActive: true },
      include: {
        services: { where: { isActive: true }, take: 4 },
      },
      take: 6,
    });
    res.render("home", { title: "Home", tenants });
  } catch (err) {
    res.render("home", { title: "Home", tenants: [] });
  }
});

// ─── AUTH PAGES ─────────────────────────────────────────────────────────────

router.get("/login", (req, res) => {
  if (req.session && req.session.user) return res.redirect("/dashboard");
  res.render("auth/login", { title: "Login" });
});

router.post("/login", async (req, res) => {
  try {
    const result = await authService.login(req.body.email, req.body.password);
    // Store user + tokens in session
    req.session.user = result.user;
    req.session.accessToken = result.accessToken;
    req.session.refreshToken = result.refreshToken;
    // Check if user has a tenant
    const fullUser = await prisma.user.findUnique({ where: { id: result.user.id }, select: { tenantId: true } });
    req.session.user.tenantId = fullUser?.tenantId || null;
    if (fullUser?.tenantId) {
      return res.redirect("/dashboard");
    }
    // Business owner without tenant → setup
    if (result.user.role === "BUSINESS_OWNER") {
      return res.redirect("/setup");
    }
    res.redirect("/");
  } catch (err) {
    req.flash("error", err.message || "Invalid credentials");
    res.redirect("/login");
  }
});

router.get("/register", (req, res) => {
  if (req.session && req.session.user) return res.redirect("/dashboard");
  res.render("auth/register", { title: "Register" });
});

router.post("/register", async (req, res) => {
  try {
    await authService.register(req.body);
    req.flash("success", "Registration successful! Please log in.");
    res.redirect("/login");
  } catch (err) {
    req.flash("error", err.message || "Registration failed");
    res.redirect("/register");
  }
});

router.get("/forgot-password", (req, res) => {
  res.render("auth/forgot-password", { title: "Forgot Password" });
});

router.post("/forgot-password", async (req, res) => {
  try {
    await authService.forgotPassword(req.body.email);
    req.flash("success", "If that email exists, a reset link has been sent.");
    res.redirect("/login");
  } catch (err) {
    req.flash("error", err.message);
    res.redirect("/forgot-password");
  }
});

router.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

// ─── BUSINESS SETUP ─────────────────────────────────────────────────────────

router.get("/setup", viewAuth, (req, res) => {
  if (req.user.tenantId) return res.redirect("/dashboard");
  res.render("setup", { title: "Setup Business" });
});

router.post("/setup", viewAuth, async (req, res) => {
  try {
    const tenant = await tenantsService.create(req.body, req.user.id);
    // Refresh session with tenantId
    req.session.user.tenantId = tenant.id;
    req.flash("success", "Business created! Add services and staff to start accepting bookings.");
    res.redirect("/dashboard");
  } catch (err) {
    req.flash("error", err.message || "Failed to create business");
    res.redirect("/setup");
  }
});

// ─── PUBLIC BUSINESS & BOOKING PAGES ────────────────────────────────────────

router.get("/business/:slug", async (req, res, next) => {
  try {
    const tenant = await tenantsService.findBySlug(req.params.slug);
    res.render("public/business", { title: tenant.name, tenant });
  } catch (err) {
    next(err);
  }
});

router.get("/book/:slug", async (req, res, next) => {
  try {
    const tenant = await tenantsService.findBySlug(req.params.slug);
    const serviceId = req.query.serviceId;
    if (!serviceId) {
      return res.redirect("/business/" + req.params.slug);
    }
    const service = await prisma.service.findFirst({ where: { id: serviceId, tenantId: tenant.id, isActive: true } });
    if (!service) {
      req.flash("error", "Service not found");
      return res.redirect("/business/" + req.params.slug);
    }
    res.render("public/book", { title: "Book " + service.name, tenant, service });
  } catch (err) {
    next(err);
  }
});

router.get("/lookup", (req, res) => {
  res.render("public/lookup", { title: "Track Booking" });
});

// ─── DASHBOARD ──────────────────────────────────────────────────────────────

router.get("/dashboard", viewAuth, requireTenant, async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const period = req.query.period || "30d";
    const [tenant, stats, upcoming] = await Promise.all([
      tenantsService.findOne(tenantId),
      dashboardService.getStats(tenantId, period),
      dashboardService.getUpcoming(tenantId, 5),
    ]);
    res.render("dashboard/index", {
      title: "Dashboard", tenant, stats, upcoming,
      reqProtocol: req.protocol, reqHost: req.get("host"),
    });
  } catch (err) { next(err); }
});

router.get("/dashboard/bookings", viewAuth, requireTenant, async (req, res, next) => {
  try {
    const result = await bookingsService.getBookings(req.user.tenantId, req.query);
    res.render("dashboard/bookings", { title: "Bookings", result, query: req.query });
  } catch (err) { next(err); }
});

router.get("/dashboard/bookings/:id", viewAuth, requireTenant, async (req, res, next) => {
  try {
    const booking = await bookingsService.getOne(req.user.tenantId, req.params.id);
    res.render("dashboard/booking-detail", { title: "Booking Detail", booking });
  } catch (err) { next(err); }
});

router.post("/dashboard/bookings/:id/cancel", viewAuth, requireTenant, async (req, res) => {
  try {
    await bookingsService.cancelBooking(req.user.tenantId, req.params.id, req.body.reason);
    req.flash("success", "Booking cancelled.");
  } catch (err) {
    req.flash("error", err.message);
  }
  res.redirect("/dashboard/bookings/" + req.params.id);
});

router.post("/dashboard/bookings/:id/no-show", viewAuth, requireTenant, async (req, res) => {
  try {
    await bookingsService.markNoShow(req.user.tenantId, req.params.id);
    req.flash("success", "Booking marked as No-Show.");
  } catch (err) {
    req.flash("error", err.message);
  }
  res.redirect("/dashboard/bookings/" + req.params.id);
});

router.post("/dashboard/bookings/:id/reschedule", viewAuth, requireTenant, async (req, res) => {
  try {
    const newBooking = await bookingsService.reschedule(req.user.tenantId, req.params.id, req.body.newStartTime);
    req.flash("success", "Booking rescheduled.");
    res.redirect("/dashboard/bookings/" + newBooking.id);
  } catch (err) {
    req.flash("error", err.message);
    res.redirect("/dashboard/bookings/" + req.params.id);
  }
});

router.get("/dashboard/calendar", viewAuth, requireTenant, async (req, res, next) => {
  try {
    const date = req.query.date || new Date().toISOString().split("T")[0];
    const bookings = await dashboardService.getCalendar(req.user.tenantId, date);
    res.render("dashboard/calendar", { title: "Calendar", date, bookings });
  } catch (err) { next(err); }
});

// Services CRUD
router.get("/dashboard/services", viewAuth, requireTenant, async (req, res, next) => {
  try {
    const services = await servicesService.findAll(req.user.tenantId, false);
    res.render("dashboard/services", { title: "Services", services });
  } catch (err) { next(err); }
});

router.post("/dashboard/services", viewAuth, requireTenant, async (req, res) => {
  try {
    const data = {
      name: req.body.name,
      description: req.body.description || undefined,
      durationMinutes: parseInt(req.body.durationMinutes),
      price: parseFloat(req.body.price),
      depositAmount: parseFloat(req.body.depositAmount || "0"),
    };
    await servicesService.create(req.user.tenantId, data);
    req.flash("success", "Service created!");
  } catch (err) {
    req.flash("error", err.message);
  }
  res.redirect("/dashboard/services");
});

router.post("/dashboard/services/:id/delete", viewAuth, requireTenant, async (req, res) => {
  try {
    await servicesService.remove(req.user.tenantId, req.params.id);
    req.flash("success", "Service removed.");
  } catch (err) {
    req.flash("error", err.message);
  }
  res.redirect("/dashboard/services");
});

// Staff CRUD
router.get("/dashboard/staff", viewAuth, requireTenant, async (req, res, next) => {
  try {
    const staffList = await staffService.findAll(req.user.tenantId);
    res.render("dashboard/staff", { title: "Staff", staffList });
  } catch (err) { next(err); }
});

router.post("/dashboard/staff", viewAuth, requireTenant, async (req, res) => {
  try {
    await staffService.create(req.user.tenantId, { name: req.body.name, bio: req.body.bio || undefined });
    req.flash("success", "Staff member added!");
  } catch (err) {
    req.flash("error", err.message);
  }
  res.redirect("/dashboard/staff");
});

router.post("/dashboard/staff/:id/deactivate", viewAuth, requireTenant, async (req, res) => {
  try {
    await staffService.deactivate(req.user.tenantId, req.params.id);
    req.flash("success", "Staff deactivated.");
  } catch (err) {
    req.flash("error", err.message);
  }
  res.redirect("/dashboard/staff");
});

// Settings
router.get("/dashboard/settings", viewAuth, requireTenant, async (req, res, next) => {
  try {
    const tenant = await tenantsService.findOne(req.user.tenantId);
    res.render("dashboard/settings", {
      title: "Settings", tenant,
      reqProtocol: req.protocol, reqHost: req.get("host"),
    });
  } catch (err) { next(err); }
});

router.post("/dashboard/settings/info", viewAuth, requireTenant, async (req, res) => {
  try {
    const data = {};
    ["name", "category", "phone", "timezone", "address"].forEach(k => {
      if (req.body[k] !== undefined) data[k] = req.body[k] || null;
    });
    ["bookingLeadTimeHours", "bookingAdvanceLimitDays", "bufferMinutes"].forEach(k => {
      if (req.body[k] !== undefined) data[k] = parseInt(req.body[k]);
    });
    await tenantsService.update(req.user.tenantId, data);
    req.flash("success", "Business info updated!");
  } catch (err) {
    req.flash("error", err.message);
  }
  res.redirect("/dashboard/settings");
});

router.post("/dashboard/settings/hours", viewAuth, requireTenant, async (req, res) => {
  try {
    const hours = [];
    for (let d = 0; d <= 6; d++) {
      const h = req.body.hours?.[d];
      if (h) {
        hours.push({
          dayOfWeek: parseInt(h.dayOfWeek),
          isOpen: h.isOpen === "true",
          openTime: h.openTime || "09:00",
          closeTime: h.closeTime || "18:00",
        });
      } else {
        // Unchecked checkbox → day is closed
        hours.push({ dayOfWeek: d, isOpen: false, openTime: "09:00", closeTime: "18:00" });
      }
    }
    await tenantsService.updateBusinessHours(req.user.tenantId, hours);
    req.flash("success", "Business hours updated!");
  } catch (err) {
    req.flash("error", err.message);
  }
  res.redirect("/dashboard/settings");
});

router.post("/dashboard/settings/holidays", viewAuth, requireTenant, async (req, res) => {
  try {
    await tenantsService.addHoliday(req.user.tenantId, req.body.date, req.body.reason);
    req.flash("success", "Holiday added!");
  } catch (err) {
    req.flash("error", err.message);
  }
  res.redirect("/dashboard/settings");
});

router.post("/dashboard/settings/holidays/:id/delete", viewAuth, requireTenant, async (req, res) => {
  try {
    await tenantsService.removeHoliday(req.user.tenantId, req.params.id);
    req.flash("success", "Holiday removed.");
  } catch (err) {
    req.flash("error", err.message);
  }
  res.redirect("/dashboard/settings");
});

// Notifications
router.get("/dashboard/notifications", viewAuth, requireTenant, async (req, res, next) => {
  try {
    const result = await dashboardService.getNotificationLogs(req.user.tenantId, req.query.page, req.query.limit);
    res.render("dashboard/notifications", { title: "Notifications", result });
  } catch (err) { next(err); }
});

module.exports = router;
