const router = require("express").Router();
const authService = require("../services/auth.service");
const tenantsService = require("../services/tenants.service");
const servicesService = require("../services/services.service");
const staffService = require("../services/staff.service");
const bookingsService = require("../services/bookings.service");
const dashboardService = require("../services/dashboard.service");
const prisma = require("../utils/prisma.client");
const passport = require("../utils/passport");
const { signAccessToken, signRefreshToken } = require("../utils/jwt.utils");

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

// Helper: set session from a user object
async function setUserSession(req, user) {
  const payload = { sub: user.id, email: user.email, role: user.role, tenantId: user.tenantId };
  req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role, avatarUrl: user.avatarUrl };
  req.session.accessToken = signAccessToken(payload);
  req.session.refreshToken = signRefreshToken(payload);
  const fullUser = await prisma.user.findUnique({ where: { id: user.id }, select: { tenantId: true } });
  req.session.user.tenantId = fullUser?.tenantId || null;
  return fullUser;
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
  res.render("auth/login", { title: "Sign In", fullPage: true });
});

router.post("/login", async (req, res) => {
  try {
    const result = await authService.login(req.body.email, req.body.password);
    const fullUser = await setUserSession(req, result.user);
    if (fullUser?.tenantId) return res.redirect("/dashboard");
    if (result.user.role === "BUSINESS_OWNER") return res.redirect("/setup");
    res.redirect("/");
  } catch (err) {
    req.flash("error", err.message || "Invalid credentials");
    res.redirect("/login");
  }
});

router.get("/register", (req, res) => {
  if (req.session && req.session.user) return res.redirect("/dashboard");
  res.render("auth/register", { title: "Sign Up", fullPage: true });
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

// ─── PROFILE ─────────────────────────────────────────────────────────────────

router.get("/profile", viewAuth, async (req, res) => {
  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: req.session.user.id },
      select: { id: true, name: true, email: true, role: true, avatarUrl: true,
                createdAt: true, passwordHash: true, googleId: true },
    });
    const profileUser = {
      ...dbUser,
      hasPassword: !!dbUser.passwordHash,
      hasGoogleId: !!dbUser.googleId,
    };
    res.render("profile", { title: "My Profile", profileUser });
  } catch (err) {
    req.flash("error", "Could not load profile.");
    res.redirect("/");
  }
});

router.post("/profile/update", viewAuth, async (req, res) => {
  try {
    const { name, email } = req.body;
    if (!name || name.trim().length < 2) throw new Error("Name must be at least 2 characters.");
    if (!email || !email.includes("@")) throw new Error("Invalid email address.");

    // Check if email is taken by another user
    const existing = await prisma.user.findFirst({ where: { email: email.trim() } });
    if (existing && existing.id !== req.session.user.id) {
      throw new Error("That email is already in use by another account.");
    }

    await prisma.user.update({
      where: { id: req.session.user.id },
      data: { name: name.trim(), email: email.trim() },
    });
    // Update session
    req.session.user.name = name.trim();
    req.session.user.email = email.trim();
    req.flash("success", "Profile updated successfully!");
  } catch (err) {
    req.flash("error", err.message || "Failed to update profile.");
  }
  res.redirect("/profile");
});

router.post("/profile/change-password", viewAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    if (newPassword !== confirmPassword) throw new Error("New passwords do not match.");
    if (!newPassword || newPassword.length < 8) throw new Error("Password must be at least 8 characters.");
    await authService.changePassword(req.session.user.id, currentPassword, newPassword);
    req.flash("success", "Password changed successfully!");
  } catch (err) {
    req.flash("error", err.message || "Failed to change password.");
  }
  res.redirect("/profile");
});


// ─── GOOGLE OAUTH ────────────────────────────────────────────────────────────

router.get("/auth/google",
  (req, res, next) => {
    // Store redirect destination for after login
    req.session.oauthReturn = req.query.return || "/";
    next();
  },
  passport.authenticate("google", { scope: ["profile", "email"] })
);

router.get("/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login", failureFlash: true }),
  async (req, res) => {
    try {
      const user = req.user;
      const fullUser = await setUserSession(req, user);
      req.flash("success", `Welcome, ${user.name.split(" ")[0]}! 🎉`);
      if (fullUser?.tenantId) return res.redirect("/dashboard");
      if (user.role === "BUSINESS_OWNER") return res.redirect("/setup");
      res.redirect(req.session.oauthReturn || "/");
    } catch (err) {
      req.flash("error", "Google login failed. Please try again.");
      res.redirect("/login");
    }
  }
);

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
    res.render("public/book", {
      title: "Book " + service.name,
      tenant,
      service,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID || "rzp_test_placeholder",
    });
  } catch (err) {
    next(err);
  }
});

router.get("/my-bookings", async (req, res, next) => {
  try {
    const user = req.session?.user || null;
    let initialBookings = null;
    if (user && user.email) {
      initialBookings = await bookingsService.getCustomerBookings(user.email);
    }
    res.render("public/my-bookings", {
      title: "My Bookings",
      user,
      initialBookings,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/lookup", (req, res) => {
  const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  res.redirect(301, "/my-bookings" + qs);
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

router.get("/dashboard/chat", viewAuth, requireTenant, async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const tenant = await tenantsService.findOne(tenantId);
    const initialThreadId = req.query.threadId || null;
    res.render("dashboard/chat", {
      title: "Messages & Inquiries",
      tenant,
      initialThreadId,
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
      depositAmount: parseFloat(req.body.price),
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

// Staff CRUD & Recruitment Hub
router.get("/dashboard/staff", viewAuth, requireTenant, async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const [staffList, services, applications] = await Promise.all([
      staffService.findAll(tenantId, true),
      servicesService.findAll(tenantId, false),
      staffService.getApplications(tenantId),
    ]);
    res.render("dashboard/staff", {
      title: "Staff & Recruitment Hub",
      staffList,
      services,
      applications,
    });
  } catch (err) { next(err); }
});

router.post("/dashboard/staff", viewAuth, requireTenant, async (req, res) => {
  try {
    let serviceIds = req.body.serviceIds;
    if (serviceIds && !Array.isArray(serviceIds)) {
      serviceIds = [serviceIds];
    }
    await staffService.create(req.user.tenantId, {
      name: req.body.name,
      roleTitle: req.body.roleTitle || undefined,
      email: req.body.email || undefined,
      phone: req.body.phone || undefined,
      bio: req.body.bio || undefined,
      serviceIds,
    });
    req.flash("success", "Staff member added successfully!");
  } catch (err) {
    req.flash("error", err.message);
  }
  res.redirect("/dashboard/staff");
});

router.post("/dashboard/staff/applications/:id/accept", viewAuth, requireTenant, async (req, res) => {
  try {
    let serviceIds = req.body.serviceIds;
    if (serviceIds && !Array.isArray(serviceIds)) {
      serviceIds = [serviceIds];
    }
    await staffService.acceptApplication(req.user.tenantId, req.params.id, {
      serviceIds,
      roleTitle: req.body.roleTitle,
      notes: req.body.notes,
    });
    req.flash("success", "Candidate hired and added to active staff roster!");
  } catch (err) {
    req.flash("error", err.message);
  }
  res.redirect("/dashboard/staff?tab=applications");
});

router.post("/dashboard/staff/applications/:id/reject", viewAuth, requireTenant, async (req, res) => {
  try {
    await staffService.rejectApplication(req.user.tenantId, req.params.id, req.body.notes);
    req.flash("success", "Application marked as rejected.");
  } catch (err) {
    req.flash("error", err.message);
  }
  res.redirect("/dashboard/staff?tab=applications");
});

router.post("/dashboard/staff/:id/deactivate", viewAuth, requireTenant, async (req, res) => {
  try {
    await staffService.deactivate(req.user.tenantId, req.params.id);
    req.flash("success", "Staff member deactivated.");
  } catch (err) {
    req.flash("error", err.message);
  }
  res.redirect("/dashboard/staff");
});

router.post("/dashboard/staff/:id/activate", viewAuth, requireTenant, async (req, res) => {
  try {
    await staffService.activate(req.user.tenantId, req.params.id);
    req.flash("success", "Staff member reactivated!");
  } catch (err) {
    req.flash("error", err.message);
  }
  res.redirect("/dashboard/staff");
});

// Candidate Public Staff Application Views & Submission
router.get("/business/:slug/apply-staff", async (req, res, next) => {
  try {
    const tenant = await tenantsService.findBySlug(req.params.slug);
    res.render("public/apply-staff", {
      title: `Apply to ${tenant.name} - Careers`,
      tenant,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/business/:slug/apply-staff", async (req, res) => {
  try {
    const tenant = await tenantsService.findBySlug(req.params.slug);
    await staffService.applyForStaff(tenant.id, req.body);
    req.flash("success", `Application submitted successfully to ${tenant.name}! The owner will review your application.`);
    res.redirect(`/business/${req.params.slug}`);
  } catch (err) {
    req.flash("error", err.message || "Failed to submit job application.");
    res.redirect(`/business/${req.params.slug}/apply-staff`);
  }
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
