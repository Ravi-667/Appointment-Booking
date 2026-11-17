# 📅 Appointment Booking Platform

[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green.svg)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express-4.x-blue.svg)](https://expressjs.com/)
[![Prisma ORM](https://img.shields.io/badge/Prisma-5.x-teal.svg)](https://www.prisma.io/)
[![Neon Database](https://img.shields.io/badge/Neon-PostgreSQL-00e699.svg)](https://neon.tech/)
[![Redis](https://img.shields.io/badge/Redis-7.x-red.svg)](https://redis.io/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-3.x-38bdf8.svg)](https://tailwindcss.com/)
[![Tests](https://img.shields.io/badge/Jest%20Tests-31%20Passed-brightgreen.svg)]()

A complete, production-grade **Multi-Tenant Appointment Booking SaaS Platform** designed for salons, dental clinics, physiotherapy centers, and professional service businesses.

Built with **pure Node.js + Express + Prisma ORM + PostgreSQL (Neon) + Redis + EJS & Tailwind CSS**.

---

## 🌟 Key Features

### 🏢 Multi-Tenant Architecture
- Isolated business tenants with custom slugs (e.g., `/business/radha-beauty-salon`).
- Configurable lead times, advance booking windows, cancellation cutoffs, and buffer minutes per business.
- Independent operating schedules, holidays, service catalogs, and staff rosters.

### ⏱️ Real-Time Availability Engine & 12-Hour AM/PM UI
- Automatic time slot generation factoring in business hours, staff shifts, service durations, and buffer times.
- Unified **12-Hour AM/PM schedule formatting** (`09:00 AM – 07:00 PM`) across public views, dashboard, emails, and SMS.
- Timezone-aware scheduling configured for `Asia/Kolkata` (customizable per tenant).

### 🔒 Race-Condition Proof (Atomic Slot Locking)
- Powered by Redis `SET key val EX 600 NX` atomic locks.
- Holds time slots for 10 minutes during customer checkout to prevent concurrent double-booking.

### 🖥️ Complete UI Suite (EJS + Tailwind CSS)
- **Public Customer Portal**:
  - Homepage showcasing featured businesses (`/`).
  - Salon/Clinic public profile (`/business/:slug`).
  - Interactive 3-step booking wizard with real-time slot selection (`/book/:slug`).
  - Public booking tracking portal (`/lookup`).
- **Business Management Dashboard** (`/dashboard`):
  - Real-time revenue metrics, cancellation rates, and upcoming appointment cards.
  - Interactive table with full-row click redirects and appointment details (`/dashboard/bookings/:id`).
  - Daily & weekly calendar views (`/dashboard/calendar`).
  - Service catalog management with pricing and deposit controls (`/dashboard/services`).
  - Staff management and service assignment mapping (`/dashboard/staff`).
  - Business hours and holiday scheduler (`/dashboard/settings`).
  - Notification audit logs (`/dashboard/notifications`).

### ⚡ Background Workers & Notifications
- **BullMQ + Redis Worker**: Automated recurring reminders dispatched 24 hours and 1 hour before appointments.
- **Nodemailer + MailHog**: Transactional booking confirmation and cancellation emails.
- **Twilio SMS**: Mobile notification fallback with local console logging.
- **Audit Logging**: Sensitive actions (cancellations, reschedules, refunds, logins) recorded in the database.

---

## 🏢 Pre-Seeded Demo Businesses

The application comes pre-populated with 4 distinct industries and active appointments:

| Business Name | Category | Public Booking URL | Owner Login (`SecurePass@1`) |
|---|---|---|---|
| **Radha Beauty Salon** | Salon & Spa | [`/business/radha-beauty-salon`](http://localhost:3000/business/radha-beauty-salon) | `radha@salon.com` |
| **Aura Dental Care & Clinic** | Dental & Healthcare | [`/business/aura-dental-clinic`](http://localhost:3000/business/aura-dental-clinic) | `dr.arun@auradental.com` |
| **Zenith Physiotherapy & Rehab** | Physiotherapy & Fitness | [`/business/zenith-physio-rehab`](http://localhost:3000/business/zenith-physio-rehab) | `vikram@zenithphysio.com` |
| **Urban Kings Men's Grooming** | Men's Salon & Grooming | [`/business/urban-kings-grooming`](http://localhost:3000/business/urban-kings-grooming) | `kabir@urbankings.com` |

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| **Runtime & Framework** | Node.js (v18+), Express.js (CommonJS) |
| **Database & ORM** | Neon Serverless PostgreSQL, Prisma ORM 5.x |
| **Caching & Locking** | Redis 7.x (IoRedis) |
| **Queues & Jobs** | BullMQ |
| **Views & Frontend** | EJS, express-ejs-layouts, Tailwind CSS (CDN) |
| **Auth & Security** | JWT (jsonwebtoken), bcrypt, express-session, helmet, rate-limit |
| **File Processing** | Multer (memory storage), Sharp (image optimization) |
| **API Docs** | Swagger OpenAPI 3.0 (`/api/docs`) |
| **Testing** | Jest, Supertest (31 unit & E2E tests) |

---

## 🚀 Local Development Setup

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for Redis, Kafka, and MailHog)
- [Neon Database Account](https://neon.tech/) (or local PostgreSQL)

### 2. Clone & Install
```bash
git clone https://github.com/Ravi-667/Appointment-Booking.git
cd Appointment-Booking
npm install
```

### 3. Configure Environment Variables
Create a `.env` file in the root directory (based on `.env.example`):
```env
PORT=3000
NODE_ENV=development

# JWT Secrets
JWT_ACCESS_SECRET=your-64-byte-hex-access-secret
JWT_REFRESH_SECRET=your-64-byte-hex-refresh-secret
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Database (Neon PostgreSQL connection)
DATABASE_URL="postgresql://neondb_owner:<password>@ep-xxxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"
DIRECT_URL="postgresql://neondb_owner:<password>@ep-xxxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Kafka (optional for local event logging)
KAFKA_BROKERS=localhost:9092

# Email (Mailhog local SMTP)
SMTP_HOST=localhost
SMTP_PORT=1025
EMAIL_FROM=noreply@bookingapp.local

# Payment Gateway (Razorpay mock/test)
RAZORPAY_KEY_ID=rzp_test_placeholder
RAZORPAY_KEY_SECRET=placeholder
RAZORPAY_WEBHOOK_SECRET=placeholder
```

### 4. Start Infrastructure Containers
Start Redis, Kafka, and MailHog via Docker:
```bash
docker compose up -d redis kafka zookeeper mailhog
```

### 5. Initialize Database & Seed
```bash
# Push schema to PostgreSQL (Neon)
npx prisma db push

# Seed 4 business platforms, staff, services & bookings
node prisma/seed.js
```

### 6. Start Application
```bash
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 🧪 Running Automated Tests

The test suite covers unit logic, middlewares, authentication, and end-to-end API flows:

```bash
npm test
```

**Results**: All 12 test suites (31 tests) pass with exit code 0:
- `validate.middleware.test.js`
- `datetime.utils.test.js` (12-hour AM/PM format validation)
- `jwt.utils.test.js`
- `audit.service.test.js`
- `notifications.service.test.js`
- `sms.test.js`
- `auth.service.test.js`
- `availability.service.test.js`
- `health.test.js`
- `uploads.test.js`
- `lookup.test.js`
- `change-password.test.js`

---

## 🌐 Complete Deployment Guide

### Where Should You Deploy This App?
Because this project uses **Node.js + Express + Neon (Cloud PostgreSQL) + Redis**:

| Platform | Best For | Complexity | Free/Low Cost Tier |
|---|---|:---:|:---:|
| **[Render.com](https://render.com/)** *(Recommended)* | Web Service + Redis + Auto Deploy from GitHub | ⭐ (Easiest) | ✅ Yes |
| **[Railway.app](https://railway.app/)** | 1-Click deploy with integrated Redis plugin | ⭐ (Very Easy) | ✅ $5 credit |
| **[VPS (DigitalOcean / AWS EC2)](https://www.digitalocean.com/)** | Full control using `Dockerfile` & `docker-compose.yml` | ⭐⭐⭐ (DevOps) | $4–$6/mo |

---

### Step-by-Step Deployment on **Render.com** (Recommended)

#### Step 1: Create a Managed Redis Instance on Render
1. Sign up / Log in to [Render.com](https://dashboard.render.com/).
2. Click **New +** ➔ **Redis**.
3. Name: `booking-redis` ➔ Plan: **Free**.
4. Click **Create Redis**.
5. Copy the **Internal Redis URL** (e.g. `rediss://default:xxxx@red-xxxx:6379`).

#### Step 2: Deploy the Web Service on Render
1. In Render Dashboard, click **New +** ➔ **Web Service**.
2. Connect your GitHub repository: `Ravi-667/Appointment-Booking`.
3. Configure the settings:
   - **Name**: `appointment-booking`
   - **Environment**: `Node`
   - **Build Command**: `npm install && npx prisma generate && npx prisma db push`
   - **Start Command**: `npm start`
   - **Plan**: `Free`

#### Step 3: Add Environment Variables in Render
In the **Environment Variables** tab of your Render service, add:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | *Your Neon pooled connection string* |
| `DIRECT_URL` | *Your Neon direct connection string* |
| `REDIS_HOST` | *The host from your Render Redis instance* |
| `REDIS_PORT` | `6379` |
| `JWT_ACCESS_SECRET` | *Any strong random 64-char string* |
| `JWT_REFRESH_SECRET` | *Any strong random 64-char string* |
| `EMAIL_FROM` | `noreply@yourdomain.com` |

Click **Save Changes**. Render will automatically build, apply database migrations, and deploy your app live with a public HTTPS URL (e.g., `https://appointment-booking.onrender.com`)!

---

### Alternative: Deploy on **Railway.app**

1. Go to [Railway.app](https://railway.app/) and click **New Project** ➔ **Deploy from GitHub repo**.
2. Select `Appointment-Booking`.
3. Click **Add a Service** ➔ **Database** ➔ **Redis**.
4. In your Web Service **Variables**, add:
   - `DATABASE_URL`: *Your Neon connection string*
   - `DIRECT_URL`: *Your Neon direct connection string*
   - `REDIS_HOST`: `${{Redis.REDISHOST}}`
   - `REDIS_PORT`: `${{Redis.REDISPORT}}`
   - `JWT_ACCESS_SECRET` & `JWT_REFRESH_SECRET`
5. Railway will automatically provision a domain and start your application.

---

## 📁 Repository Structure

```
├── .github/workflows/ci.yml       # Automated GitHub Actions CI pipeline
├── docker/                        # Production Dockerfiles (Dockerfile.api)
├── docker-compose.yml             # Local service orchestration (Redis, Kafka, MailHog)
├── prisma/
│   ├── schema.prisma              # Database models with Neon pooling & directUrl
│   └── seed.js                    # Multi-tenant comprehensive random seeder
├── src/
│   ├── index.js                   # Application bootstrap & BullMQ recurring worker
│   ├── app.js                     # Express app setup, middlewares, EJS locals
│   ├── middlewares/               # JWT auth, tenant scope, validation, error handler
│   ├── routes/                    # API v1 endpoints + EJS view page routes
│   ├── services/                  # Business logic (Auth, Bookings, Availability, Audit)
│   ├── utils/                     # Prisma client, JWT, Kafka, 12-hour Datetime utils
│   └── views/                     # EJS UI templates (Public, Auth, Dashboard partials)
├── test/                          # Unit and End-to-End Jest tests (12 suites, 31 tests)
├── nodemon.json                   # Hot-reload configuration tracking src, prisma & .env
└── package.json                   # Dependencies, scripts, and project metadata
```

---

## 📄 License
This project is open-source and available under the [MIT License](LICENSE).
