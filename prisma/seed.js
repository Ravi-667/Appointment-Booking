const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");

const prisma = new PrismaClient();

// Helper random utilities
const sample = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const FIRST_NAMES = [
  "Aarav", "Aditi", "Rohan", "Sneha", "Vikram", "Pooja", "Rahul", "Ananya",
  "Kavita", "Siddharth", "Neha", "Arjun", "Deepika", "Karan", "Meera", "Varun",
  "Rishi", "Tanvi", "Aditya", "Ishita", "Manish", "Swati", "Nikhil", "Simran"
];

const LAST_NAMES = [
  "Sharma", "Patel", "Verma", "Iyer", "Reddy", "Mehta", "Joshi", "Kapoor",
  "Nair", "Bose", "Chopra", "Gupta", "Deshmukh", "Menon", "Singh", "Sethi"
];

const CATEGORIES = [
  { name: "Hair & Styling", icon: "scissors", color: "#3B82F6" },
  { name: "Spa & Wellness", icon: "spa", color: "#10B981" },
  { name: "Skin & Beauty", icon: "sparkles", color: "#EC4899" },
  { name: "Consultation & Therapy", icon: "clipboard", color: "#8B5CF6" },
  { name: "Dental & Healthcare", icon: "tooth", color: "#06B6D4" },
  { name: "Physiotherapy & Fitness", icon: "heart-pulse", color: "#F59E0B" },
];

const TENANTS_CONFIG = [
  {
    name: "Radha Beauty Salon",
    slug: "radha-beauty-salon",
    category: "Salon & Spa",
    email: "info@radhasalon.com",
    phone: "+91 98765 43210",
    address: "123 Indiranagar, 100ft Road, Bengaluru, Karnataka",
    owner: {
      name: "Radha Sharma",
      email: "radha@salon.com",
      password: "SecurePass@1",
    },
    staff: [
      { name: "Priya Verma", bio: "Senior Stylist with 8+ years experience in bridal styling & precision haircuts." },
      { name: "Ananya Sen", bio: "Certified therapist specializing in deep tissue massage and steam spas." },
      { name: "Rahul Kapoor", bio: "Expert colorist and master of keratin and scalp treatments." },
      { name: "Sneha Patel", bio: "Skincare aesthetician certified in holistic herbal therapies." },
      { name: "Vikram Nair", bio: "Senior barber specialized in beard sculpting and grooming." }
    ],
    services: [
      { name: "Classic Haircut & Styling", cat: "Hair & Styling", desc: "Professional wash, precision cut, and blow-dry finish.", duration: 30, price: 499, deposit: 100 },
      { name: "Deluxe Hair Spa & Deep Conditioning", cat: "Hair & Styling", desc: "Intense moisture infusion with argan oil massage and steam therapy.", duration: 60, price: 1499, deposit: 300 },
      { name: "Beard Grooming & Royal Shave", cat: "Hair & Styling", desc: "Hot towel prep, precision straight-razor shave, and organic balm finish.", duration: 30, price: 399, deposit: 100 },
      { name: "Aromatherapy Full Body Massage", cat: "Spa & Wellness", desc: "Swedish relaxation massage using therapeutic lavender and eucalyptus essential oils.", duration: 90, price: 2499, deposit: 500 },
      { name: "Ayurvedic Herbal Facial", cat: "Spa & Wellness", desc: "Cleanse, exfoliation, and custom herbal mask for luminous skin tone.", duration: 45, price: 999, deposit: 200 },
      { name: "Bridal Skin Radiance Therapy", cat: "Skin & Beauty", desc: "Complete rejuvenation treatment designed for weddings and special occasions.", duration: 120, price: 4999, deposit: 1000 }
    ]
  },
  {
    name: "Aura Dental Care & Clinic",
    slug: "aura-dental-clinic",
    category: "Dental & Healthcare",
    email: "care@auradental.com",
    phone: "+91 98111 22334",
    address: "45 Defence Colony, Ring Road, New Delhi",
    owner: {
      name: "Dr. Arun Sharma",
      email: "dr.arun@auradental.com",
      password: "SecurePass@1",
    },
    staff: [
      { name: "Dr. Arun Sharma", bio: "Chief Dental Surgeon & Implantologist with 14+ years clinical experience." },
      { name: "Dr. Neha Sen", bio: "Cosmetic Dentist specialized in invisible aligners, veneers, and smile design." },
      { name: "Dr. Rohit Verma", bio: "Senior Endodontist & Microscopic Root Canal Specialist." }
    ],
    services: [
      { name: "Dental Consultation & Digital X-Ray", cat: "Consultation & Therapy", desc: "Comprehensive intraoral exam, digital cavity check, and preventive treatment plan.", duration: 30, price: 500, deposit: 100 },
      { name: "Teeth Cleaning & Ultrasonic Scaling", cat: "Dental & Healthcare", desc: "Deep plaque and calculus removal with enamel polishing and fluoride treatment.", duration: 45, price: 1200, deposit: 300 },
      { name: "Laser Teeth Whitening Session", cat: "Dental & Healthcare", desc: "Advanced laser whitening system providing up to 6 shades brighter in one sitting.", duration: 60, price: 4500, deposit: 1000 },
      { name: "Root Canal Specialist Treatment", cat: "Dental & Healthcare", desc: "Painless single-visit microscopic root canal therapy with biocompatible filling.", duration: 60, price: 3500, deposit: 800 },
      { name: "Clear Aligners & Ortho Assessment", cat: "Consultation & Therapy", desc: "3D digital intraoral scan and computerized orthodontic treatment simulation.", duration: 40, price: 999, deposit: 200 }
    ]
  },
  {
    name: "Zenith Physiotherapy & Rehab",
    slug: "zenith-physio-rehab",
    category: "Physiotherapy & Fitness",
    email: "contact@zenithphysio.com",
    phone: "+91 97000 88990",
    address: "78 Road No. 36, Jubilee Hills, Hyderabad, Telangana",
    owner: {
      name: "Dr. Vikram Deshmukh",
      email: "vikram@zenithphysio.com",
      password: "SecurePass@1",
    },
    staff: [
      { name: "Dr. Vikram Deshmukh", bio: "Lead Sports Physical Therapist & Certified Kinesiologist." },
      { name: "Dr. Pooja Menon", bio: "Spine & Posture Rehabilitation Specialist with certified manual therapy." },
      { name: "Dr. Karan Bose", bio: "Senior Movement Coach & Post-Surgical Mobility Specialist." }
    ],
    services: [
      { name: "Posture Analysis & Spine Consultation", cat: "Consultation & Therapy", desc: "Digital biomechanical posture evaluation and personalized ergonomic prescription.", duration: 40, price: 800, deposit: 200 },
      { name: "Sports Injury Rehabilitation Session", cat: "Physiotherapy & Fitness", desc: "Targeted sports therapy, active release technique, and functional retraining.", duration: 60, price: 1500, deposit: 300 },
      { name: "Chiropractic Spinal Alignment", cat: "Physiotherapy & Fitness", desc: "Gentle spinal mobilization and joint decompression for chronic back and neck relief.", duration: 45, price: 2000, deposit: 500 },
      { name: "Dry Needling & Cupping Therapy", cat: "Spa & Wellness", desc: "Myofascial trigger point release and decompression cupping for deep muscle recovery.", duration: 45, price: 1400, deposit: 300 },
      { name: "Post-Surgery Mobility & Strength Rehab", cat: "Physiotherapy & Fitness", desc: "Structured rehabilitation program for ACL, meniscus, and joint replacements.", duration: 60, price: 1800, deposit: 400 }
    ]
  },
  {
    name: "Urban Kings Men's Grooming",
    slug: "urban-kings-grooming",
    category: "Men's Salon & Grooming",
    email: "lounge@urbankings.com",
    phone: "+91 98222 33445",
    address: "22 Linking Road, Bandra West, Mumbai, Maharashtra",
    owner: {
      name: "Kabir Sethi",
      email: "kabir@urbankings.com",
      password: "SecurePass@1",
    },
    staff: [
      { name: "Kabir Sethi", bio: "Master Barber trained in London with 10+ years in celebrity grooming." },
      { name: "Siddharth Rao", bio: "Beard Sculpting Artist & Men's Skincare Specialist." },
      { name: "Arjun Nair", bio: "Hair Loss, Scalp Detox & Keratin Specialist." }
    ],
    services: [
      { name: "Executive Haircut & Beard Sculpting", cat: "Hair & Styling", desc: "Signature precision fade or scissor cut combined with hand-carved beard alignment.", duration: 45, price: 899, deposit: 200 },
      { name: "Hot Towel Charcoal Beard Detox", cat: "Hair & Styling", desc: "Dual hot-steamed towels, activated charcoal scrub, and premium beard oil massage.", duration: 30, price: 599, deposit: 100 },
      { name: "Gentleman's Charcoal Detox Facial", cat: "Skin & Beauty", desc: "Deep-pore exfoliation, blackhead extraction, and balancing matte clay mask.", duration: 45, price: 1299, deposit: 300 },
      { name: "Revitalizing Scalp & Hair Therapy", cat: "Spa & Wellness", desc: "Micro-circulation scalp stimulation, anti-dandruff detox, and cooling menthol rinse.", duration: 60, price: 1899, deposit: 400 },
      { name: "The Royal Full Grooming Experience", cat: "Spa & Wellness", desc: "Haircut, luxury beard treatment, express facial, and relaxing shoulder massage.", duration: 90, price: 3499, deposit: 800 }
    ]
  }
];

async function seedTenant(cfg, categoryMap) {
  console.log(`\n🏢 Seeding business: ${cfg.name}...`);

  // 1. Upsert Tenant
  let tenant = await prisma.tenant.findUnique({ where: { slug: cfg.slug } });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        name: cfg.name,
        slug: cfg.slug,
        category: cfg.category,
        email: cfg.email,
        phone: cfg.phone,
        address: cfg.address,
        timezone: "Asia/Kolkata",
        currency: "INR",
        bookingLeadTimeHours: 1,
        bookingAdvanceLimitDays: 60,
        bufferMinutes: 5,
      },
    });

    // Default business hours (Mon-Sat 09:00 - 19:00, Sun 10:00 - 16:00)
    const hoursData = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
      tenantId: tenant.id,
      dayOfWeek: day,
      isOpen: true,
      openTime: day === 0 ? "10:00" : "09:00",
      closeTime: day === 0 ? "16:00" : "19:00",
    }));
    await prisma.businessHour.createMany({ data: hoursData });
  } else {
    // Ensure info is current
    tenant = await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        name: cfg.name,
        category: cfg.category,
        email: cfg.email,
        phone: cfg.phone,
        address: cfg.address,
      },
    });
  }

  // 2. Upsert Business Owner Account
  const passwordHash = await bcrypt.hash(cfg.owner.password, 12);
  await prisma.user.upsert({
    where: {
      email_tenantId: {
        email: cfg.owner.email,
        tenantId: tenant.id,
      },
    },
    update: {
      passwordHash,
      isActive: true,
      emailVerified: true,
    },
    create: {
      name: cfg.owner.name,
      email: cfg.owner.email,
      tenantId: tenant.id,
      passwordHash,
      role: "BUSINESS_OWNER",
      emailVerified: true,
      isActive: true,
    },
  });

  // 3. Upsert Staff Members
  const staffList = [];
  for (const s of cfg.staff) {
    let member = await prisma.staff.findFirst({
      where: { tenantId: tenant.id, name: s.name },
    });
    if (!member) {
      member = await prisma.staff.create({
        data: {
          tenantId: tenant.id,
          name: s.name,
          bio: s.bio,
          isActive: true,
        },
      });
    }
    staffList.push(member);
  }

  // 4. Upsert Services
  const serviceList = [];
  for (const s of cfg.services) {
    let service = await prisma.service.findFirst({
      where: { tenantId: tenant.id, name: s.name },
    });
    const categoryId = categoryMap[s.cat] || categoryMap["Consultation & Therapy"] || Object.values(categoryMap)[0];
    if (!service) {
      service = await prisma.service.create({
        data: {
          tenantId: tenant.id,
          categoryId,
          name: s.name,
          description: s.desc,
          durationMinutes: s.duration,
          price: s.price,
          depositAmount: s.deposit,
          isActive: true,
        },
      });
    }
    serviceList.push(service);
  }

  // 5. Connect Staff to Services
  for (const staff of staffList) {
    // Assign 2 to all services to each staff member
    const assignedServices = [...serviceList].sort(() => 0.5 - Math.random()).slice(0, Math.max(2, Math.floor(serviceList.length * 0.7)));
    for (const srv of assignedServices) {
      await prisma.staffService.upsert({
        where: { staffId_serviceId: { staffId: staff.id, serviceId: srv.id } },
        update: {},
        create: { staffId: staff.id, serviceId: srv.id },
      });
    }
  }

  // 6. Generate Past & Upcoming Bookings if needed
  const existingBookingsCount = await prisma.booking.count({ where: { tenantId: tenant.id } });
  if (existingBookingsCount < 10) {
    const statuses = ["CONFIRMED", "CONFIRMED", "CONFIRMED", "CANCELLED", "NO_SHOW"];
    const now = Date.now();

    // 12 Past bookings
    for (let i = 0; i < 12; i++) {
      const daysAgo = randomInt(1, 25);
      const hour = randomInt(10, 16);
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
          customerNotes: Math.random() > 0.6 ? "Booked via online platform" : null,
          cancellationReason: status === "CANCELLED" ? "Client schedule conflict" : null,
        },
      });

      if (status === "CONFIRMED") {
        await prisma.payment.create({
          data: {
            bookingId: booking.id,
            tenantId: tenant.id,
            razorpayOrderId: `order_${randomInt(100000, 999999)}`,
            razorpayPaymentId: `pay_${randomInt(100000, 999999)}`,
            amount: service.depositAmount,
            currency: "INR",
            status: "CAPTURED",
            type: "DEPOSIT",
          },
        });
      }
    }

    // 5 Upcoming bookings
    for (let i = 1; i <= 5; i++) {
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
          razorpayOrderId: `order_${randomInt(100000, 999999)}`,
          razorpayPaymentId: `pay_${randomInt(100000, 999999)}`,
          amount: service.depositAmount,
          currency: "INR",
          status: "CAPTURED",
          type: "DEPOSIT",
        },
      });
    }
  }

  console.log(`✓ ${cfg.name} ready with ${staffList.length} staff, ${serviceList.length} services & bookings.`);
  return tenant;
}

async function main() {
  console.log("🌱 Starting comprehensive database seeding with 4 distinct booking businesses...");

  // 1. Upsert Categories
  const categoryMap = {};
  for (const c of CATEGORIES) {
    const record = await prisma.serviceCategory.upsert({
      where: { name: c.name },
      update: {},
      create: c,
    });
    categoryMap[c.name] = record.id;
  }
  console.log("✓ Service categories registered:", Object.keys(categoryMap).join(", "));

  // 2. Seed all 4 businesses
  const seededTenants = [];
  for (const cfg of TENANTS_CONFIG) {
    const t = await seedTenant(cfg, categoryMap);
    seededTenants.push({ ...cfg, id: t.id });
  }

  console.log("\n========================================================");
  console.log("🎉 Seeding completed successfully for all 4 platforms!");
  console.log("========================================================");
  for (const t of seededTenants) {
    console.log(`👉 Business:    ${t.name} (${t.category})`);
    console.log(`   Public URL:  http://localhost:3000/business/${t.slug}`);
    console.log(`   Owner Login: ${t.owner.email} / ${t.owner.password}`);
    console.log("--------------------------------------------------------");
  }
  console.log("👉 Home Page:   http://localhost:3000");
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
