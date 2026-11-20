const router = require("express").Router();
const prisma = require("../utils/prisma.client");
const staffService = require("../services/staff.service");
const tenantsService = require("../services/tenants.service");

// Middleware to protect staff routes
function staffAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    req.flash("error", "Please sign in to access the Staff Portal.");
    return res.redirect("/login");
  }
  // Allow STAFF role, or BUSINESS_OWNER for inspection
  if (req.session.user.role !== "STAFF" && req.session.user.role !== "BUSINESS_OWNER") {
    req.flash("error", "Access denied. The Staff Portal is reserved for staff members.");
    return res.redirect("/");
  }
  req.user = req.session.user;
  next();
}

// Helper: resolve staff profile for logged in user
async function resolveStaffForUser(user) {
  if (!user.tenantId) return null;
  // Match staff by tenantId and email (case-insensitive)
  let staff = await prisma.staff.findFirst({
    where: {
      tenantId: user.tenantId,
      email: { equals: user.email.toLowerCase().trim(), mode: "insensitive" },
    },
    include: {
      tenant: true,
      staffServices: { include: { service: true } },
      schedules: { orderBy: { date: "asc" } },
    },
  });

  // If not found and user is BUSINESS_OWNER previewing, pick first active staff
  if (!staff && user.role === "BUSINESS_OWNER") {
    staff = await prisma.staff.findFirst({
      where: { tenantId: user.tenantId, isActive: true },
      include: {
        tenant: true,
        staffServices: { include: { service: true } },
        schedules: { orderBy: { date: "asc" } },
      },
    });
  }

  return staff;
}

// ─── GET /staff/dashboard ───────────────────────────────────────────────────
router.get("/staff/dashboard", staffAuth, async (req, res, next) => {
  try {
    const user = req.user;
    const staff = await resolveStaffForUser(user);

    if (!staff) {
      return res.render("staff/no-profile", {
        title: "Staff Account Unlinked",
        user,
      });
    }

    const tenant = staff.tenant || (await tenantsService.findOne(user.tenantId));

    // Fetch only appointments assigned specifically to this staff member
    const allBookings = await prisma.booking.findMany({
      where: {
        staffId: staff.id,
        tenantId: user.tenantId,
      },
      include: {
        service: true,
        tenant: true,
      },
      orderBy: { startTime: "asc" },
    });

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    const todayBookings = [];
    const upcomingBookings = [];
    const pastBookings = [];

    for (const b of allBookings) {
      const bTime = new Date(b.startTime);
      if (bTime >= startOfToday && bTime <= endOfToday && b.status !== "CANCELLED") {
        todayBookings.push(b);
      } else if (bTime > endOfToday && b.status !== "CANCELLED") {
        upcomingBookings.push(b);
      } else {
        pastBookings.push(b);
      }
    }

    // Weekly business hours
    const businessHours = await prisma.businessHour.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { dayOfWeek: "asc" },
    });

    // Custom schedule overrides for this staff member (upcoming next 60 days)
    const scheduleOverrides = await prisma.staffSchedule.findMany({
      where: {
        staffId: staff.id,
        date: { gte: startOfToday },
      },
      orderBy: { date: "asc" },
    });

    // Active tab query parameter
    const activeTab = req.query.tab || "appointments";

    res.render("staff/dashboard", {
      title: `${staff.name} - Staff Portal`,
      user,
      staff,
      tenant,
      todayBookings,
      upcomingBookings,
      pastBookings,
      totalAssigned: allBookings.length,
      businessHours,
      scheduleOverrides,
      activeTab,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /staff/schedule/override ──────────────────────────────────────────
router.post("/staff/schedule/override", staffAuth, async (req, res) => {
  try {
    const staff = await resolveStaffForUser(req.user);
    if (!staff) throw new Error("Staff record not found");

    const { date, isOff, startTime, endTime } = req.body;
    if (!date) throw new Error("Date is required");

    await staffService.setScheduleOverride(
      staff.id,
      date,
      isOff === "true" || isOff === true,
      startTime || null,
      endTime || null
    );

    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.json({ success: true, message: "Schedule updated successfully" });
    }
    req.flash("success", "Schedule updated successfully!");
  } catch (err) {
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(400).json({ error: err.message });
    }
    req.flash("error", err.message);
  }
  res.redirect("/staff/dashboard?tab=schedule");
});

// ─── POST /staff/schedule/override/delete ───────────────────────────────────
router.post("/staff/schedule/override/delete", staffAuth, async (req, res) => {
  try {
    const staff = await resolveStaffForUser(req.user);
    if (!staff) throw new Error("Staff record not found");

    const { date } = req.body;
    if (!date) throw new Error("Date is required");

    await staffService.removeScheduleOverride(staff.id, date);

    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.json({ success: true, message: "Override removed" });
    }
    req.flash("success", "Schedule override removed.");
  } catch (err) {
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(400).json({ error: err.message });
    }
    req.flash("error", err.message);
  }
  res.redirect("/staff/dashboard?tab=schedule");
});

// ─── POST /staff/bookings/:id/status ─────────────────────────────────────────
router.post("/staff/bookings/:id/status", staffAuth, async (req, res) => {
  try {
    const staff = await resolveStaffForUser(req.user);
    if (!staff) throw new Error("Staff record not found");

    const bookingId = req.params.id;
    const { status } = req.body; // e.g. "COMPLETED" or "CONFIRMED"

    // Verify booking is assigned to this staff member
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, staffId: staff.id, tenantId: req.user.tenantId },
    });
    if (!booking) throw new Error("Appointment not found or not assigned to you");

    const validStatuses = ["CONFIRMED", "COMPLETED", "IN_PROGRESS"];
    if (!validStatuses.includes(status)) throw new Error("Invalid status transition");

    await prisma.booking.update({
      where: { id: bookingId },
      data: { status },
    });

    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.json({ success: true, status });
    }
    req.flash("success", `Appointment marked as ${status.toLowerCase()}!`);
  } catch (err) {
    if (req.xhr || req.headers.accept?.includes("application/json")) {
      return res.status(400).json({ error: err.message });
    }
    req.flash("error", err.message);
  }
  res.redirect("/staff/dashboard?tab=appointments");
});

module.exports = router;
