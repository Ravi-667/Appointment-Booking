const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");

const prisma = new PrismaClient();

// Helper random utilities
const sample = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomFloat = (min, max, decimals = 2) => parseFloat((Math.random() * (max - min) + min).toFixed(decimals));

const FIRST_NAMES = [
  "Aarav", "Aditi", "Rohan", "Sneha", "Vikram", "Pooja", "Rahul", "Ananya",
  "Kavita", "Siddharth", "Neha", "Arjun", "Deepika", "Karan", "Meera", "Varun"
];

const LAST_NAMES = [
  "Sharma", "Patel", "Verma", "Iyer", "Reddy", "Mehta", "Joshi", "Kapoor",
  "Nair", "Bose", "Chopra", "Gupta", "Deshmukh", "Menon", "Singh"
];

const SERVICE_TEMPLATES = [
  { name: "Deluxe Hair Spa & Deep Conditioning", duration: 60, price: 1499, deposit: 300, cat: "Hair & Styling" },
  { name: "Beard Grooming & Royal Shave", duration: 30, price: 399, deposit: 100, cat: "Hair & Styling" },
  { name: "Express Blowdry & Styling", duration: 25, price: 349, deposit: 50, cat: "Hair & Styling" },
  { name: "Aromatherapy Full Body Massage", duration: 90, price: 2499, deposit: 500, cat: "Spa & Wellness" },
  { name: "Ayurvedic Herbal Facial", duration: 45, price: 999, deposit: 200, cat: "Spa & Wellness" },
  { name: "Foot Reflexology & Pedicure", duration: 40, price: 699, deposit: 150, cat: "Spa & Wellness" },
  { name: "Anti-Stress Head & Neck Massage", duration: 30, price: 549, deposit: 100, cat: "Spa & Wellness" },
  { name: "Bridal Skin Radiance Therapy", duration: 120, price: 4999, deposit: 1000, cat: "Skin & Beauty" }
];

async function main() {
  console.log("🌱 Starting comprehensive database seeding with randomized data...");

  // 1. Service Categories
  const categories = [
    { name: "Hair & Styling", icon: "scissors", color: "#3B82F6" },
    { name: "Spa & Wellness", icon: "spa", color: "#10B981" },
    { name: "Skin & Beauty", icon: "sparkles", color: "#EC4899" },
    { name: "Consultation & Therapy", icon: "clipboard", color: "#8B5CF6" },
  ];

  const categoryMap = {};
  for (const c of categories) {
    const record = await prisma.serviceCategory.upsert({
      where: { name: c.name },
      update: {},
      create: c,
    });
    categoryMap[c.name] = record.id;
  }
  console.log("✓ Categories seeded:", Object.keys(categoryMap).join(", "));

  // 2. Primary Demo Tenant (Radha Beauty Salon)
  let tenant = await prisma.tenant.findUnique({
    where: { slug: "radha-beauty-salon" },
  });

  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        name: "Radha Beauty Salon",
        slug: "radha-beauty-salon",
        category: "Salon & Spa",
        email: "info@radhasalon.com",
        phone: "+91 98765 43210",
        address: "123 Indiranagar, 100ft Road, Bengaluru, Karnataka",
        timezone: "Asia/Kolkata",
        currency: "INR",
        bookingLeadTimeHours: 1,
        bookingAdvanceLimitDays: 60,
        bufferMinutes: 5,
      },
    });

    // Default business hours (Mon-Sat 09:00 - 19:00, Sun closed)
    const hoursData = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
      tenantId: tenant.id,
      dayOfWeek: day,
      isOpen: day !== 0,
      openTime: "09:00",
      closeTime: "19:00",
    }));

    await prisma.businessHour.createMany({ data: hoursData });
  }

  console.log(`✓ Primary Tenant: ${tenant.name} (${tenant.id})`);

  // 3. Demo Business Owner User
  const ownerPasswordHash = await bcrypt.hash("SecurePass@1", 12);
  const ownerUser = await prisma.user.upsert({
    where: {
      email_tenantId: {
        email: "radha@salon.com",
        tenantId: tenant.id,
      },
    },
    update: {
      passwordHash: ownerPasswordHash,
      isActive: true,
      emailVerified: true,
    },
    create: {
      name: "Radha Sharma",
      email: "radha@salon.com",
      tenantId: tenant.id,
      passwordHash: ownerPasswordHash,
      role: "BUSINESS_OWNER",
      emailVerified: true,
      isActive: true,
    },
  });
  console.log(`✓ Owner account ready: ${ownerUser.email}`);

  // 4. Fixed Staff Members + Additional Random Staff
  const staffNames = [
    { name: "Priya Verma", bio: "Senior Stylist with 8+ years experience in bridal styling & precision haircuts." },
    { name: "Ananya Sen", bio: "Certified therapist specializing in deep tissue massage and steam spas." },
    { name: "Rahul Kapoor", bio: "Expert colorist and master of keratin and scalp treatments." },
    { name: "Sneha Patel", bio: "Skincare aesthetician certified in holistic herbal therapies." },
    { name: "Vikram Nair", bio: "Senior barber specialized in beard sculpting and grooming." }
  ];

  const staffList = [];
  for (const s of staffNames) {
    let staffMember = await prisma.staff.findFirst({
      where: { tenantId: tenant.id, name: s.name },
    });
    if (!staffMember) {
      staffMember = await prisma.staff.create({
        data: {
          tenantId: tenant.id,
          name: s.name,
          bio: s.bio,
          isActive: true,
        },
      });
    }
    staffList.push(staffMember);
  }
  console.log(`✓ Staff team created (${staffList.length} members)`);

  // 5. Services Creation
  const serviceList = [];

  // Core base haircut service
  let haircut = await prisma.service.findFirst({
    where: { tenantId: tenant.id, name: "Classic Haircut & Styling" },
  });
  if (!haircut) {
    haircut = await prisma.service.create({
      data: {
        tenantId: tenant.id,
        categoryId: categoryMap["Hair & Styling"],
        name: "Classic Haircut & Styling",
        description: "Professional wash, precision cut, and blow-dry finish.",
        durationMinutes: 30,
        price: 499.0,
        depositAmount: 100.0,
      },
    });
  }
  serviceList.push(haircut);

  // Additional services from templates
  for (const t of SERVICE_TEMPLATES) {
    let service = await prisma.service.findFirst({
      where: { tenantId: tenant.id, name: t.name },
    });
    if (!service) {
      service = await prisma.service.create({
        data: {
          tenantId: tenant.id,
          categoryId: categoryMap[t.cat] || categoryMap["Hair & Styling"],
          name: t.name,
          description: `Signature ${t.name.toLowerCase()} tailored to client preferences.`,
          durationMinutes: t.duration,
          price: t.price,
          depositAmount: t.deposit,
        },
      });
    }
    serviceList.push(service);
  }
  console.log(`✓ Services catalog populated (${serviceList.length} services)`);

  // 6. Connect Staff to Services (Randomized skill assignments)
  for (const s of staffList) {
    // Each staff handles 2 to 4 services randomly
    const assignedServices = [...serviceList].sort(() => 0.5 - Math.random()).slice(0, randomInt(2, 4));
    for (const srv of assignedServices) {
      await prisma.staffService.upsert({
        where: { staffId_serviceId: { staffId: s.id, serviceId: srv.id } },
        update: {},
        create: { staffId: s.id, serviceId: srv.id },
      });
    }
  }
  console.log("✓ Staff-service assignments linked");

  // 7. Seed Randomized Past & Future Bookings
  console.log("🎲 Generating realistic booking history & upcoming slots...");
  const existingBookingsCount = await prisma.booking.count({ where: { tenantId: tenant.id } });

  if (existingBookingsCount < 15) {
    const statuses = ["CONFIRMED", "CONFIRMED", "CONFIRMED", "CANCELLED", "NO_SHOW"];
    const now = Date.now();

    // Past bookings (last 30 days)
    for (let i = 0; i < 20; i++) {
      const daysAgo = randomInt(1, 28);
      const hour = randomInt(10, 17);
      const startTime = new Date(now - daysAgo * 24 * 3600 * 1000);
      startTime.setHours(hour, 0, 0, 0);

      const service = sample(serviceList);
      const staff = sample(staffList);
      const status = sample(statuses);
      const endTime = new Date(startTime.getTime() + service.durationMinutes * 60 * 1000);

      const custName = `${sample(FIRST_NAMES)} ${sample(LAST_NAMES)}`;
      const custEmail = `${custName.toLowerCase().replace(" ", ".")}${randomInt(10, 99)}@example.com`;

      const booking = await prisma.booking.create({
        data: {
          tenantId: tenant.id,
          serviceId: service.id,
          staffId: staff.id,
          customerName: custName,
          customerEmail: custEmail,
          customerPhone: `+91 ${randomInt(90000, 99999)} ${randomInt(10000, 99999)}`,
          startTime,
          endTime,
          status,
          price: service.price,
          depositAmount: service.depositAmount,
          customerNotes: Math.random() > 0.5 ? "First time visitor" : null,
          cancellationReason: status === "CANCELLED" ? "Client requested cancellation due to travel" : null,
        },
      });

      // If confirmed, add payment record
      if (status === "CONFIRMED") {
        await prisma.payment.create({
          data: {
            bookingId: booking.id,
            tenantId: tenant.id,
            razorpayOrderId: `order_seed_${randomInt(100000, 999999)}`,
            razorpayPaymentId: `pay_seed_${randomInt(100000, 999999)}`,
            amount: service.depositAmount,
            currency: "INR",
            status: "CAPTURED",
            type: "DEPOSIT",
          },
        });
      }
    }

    // Upcoming bookings (next 7 days)
    for (let i = 1; i <= 6; i++) {
      const daysAhead = i;
      const hour = randomInt(10, 16);
      const startTime = new Date(now + daysAhead * 24 * 3600 * 1000);
      startTime.setHours(hour, 0, 0, 0);

      const service = sample(serviceList);
      const staff = sample(staffList);
      const endTime = new Date(startTime.getTime() + service.durationMinutes * 60 * 1000);

      const custName = `${sample(FIRST_NAMES)} ${sample(LAST_NAMES)}`;
      const custEmail = `${custName.toLowerCase().replace(" ", ".")}@gmail.com`;

      const booking = await prisma.booking.create({
        data: {
          tenantId: tenant.id,
          serviceId: service.id,
          staffId: staff.id,
          customerName: custName,
          customerEmail: custEmail,
          customerPhone: `+91 ${randomInt(90000, 99999)} ${randomInt(10000, 99999)}`,
          startTime,
          endTime,
          status: "CONFIRMED",
          price: service.price,
          depositAmount: service.depositAmount,
        },
      });

      await prisma.payment.create({
        data: {
          bookingId: booking.id,
          tenantId: tenant.id,
          razorpayOrderId: `order_seed_${randomInt(100000, 999999)}`,
          razorpayPaymentId: `pay_seed_${randomInt(100000, 999999)}`,
          amount: service.depositAmount,
          currency: "INR",
          status: "CAPTURED",
          type: "DEPOSIT",
        },
      });
    }
    console.log("✓ Generated 26 past & future bookings with mock payments");
  } else {
    console.log(`✓ Existing bookings found (${existingBookingsCount}), skipped regeneration`);
  }

  // 8. Sample Holiday
  const newYear = new Date(new Date().getFullYear() + 1, 0, 1);
  await prisma.holiday.upsert({
    where: { tenantId_date: { tenantId: tenant.id, date: newYear } },
    update: {},
    create: { tenantId: tenant.id, date: newYear, reason: "New Year's Day" },
  });

  console.log("\n========================================================");
  console.log("🎉 Seeding completed successfully with random & fixed datasets!");
  console.log("========================================================");
  console.log("👉 Business:       Radha Beauty Salon");
  console.log("👉 Public URL:     http://localhost:3000/business/radha-beauty-salon");
  console.log("👉 Owner Login:    radha@salon.com");
  console.log("👉 Owner Password: SecurePass@1");
  console.log("👉 Dashboard URL:  http://localhost:3000/dashboard");
  console.log("========================================================\n");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
