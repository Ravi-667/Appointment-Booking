# 📅 ReserveSync — Production-Grade Multi-Tenant Appointment Booking Platform

[![Node.js](https://img.shields.io/badge/Node.js-v20%2B-green.svg)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express-4.x-blue.svg)](https://expressjs.com/)
[![Prisma ORM](https://img.shields.io/badge/Prisma-5.x-teal.svg)](https://www.prisma.io/)
[![Neon Database](https://img.shields.io/badge/Neon-PostgreSQL-00e699.svg)](https://neon.tech/)
[![Redis](https://img.shields.io/badge/Redis-7.x-red.svg)](https://redis.io/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.x-black.svg)](https://socket.io/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-3.x-38bdf8.svg)](https://tailwindcss.com/)
[![Jest Tests](https://img.shields.io/badge/Jest%20Tests-76%20Passed%20(100%25)-brightgreen.svg)]()
[![Swagger](https://img.shields.io/badge/OpenAPI%203.0-Swagger%20UI-85EA2D.svg)](https://appointment-booking-3dz0.onrender.com/api/docs)
[![CI/CD](https://img.shields.io/badge/GitHub%20Actions-CI%20Passing-success.svg)]()
[![Live on Render](https://img.shields.io/badge/Live%20Demo-Render.com-46E3B7.svg)](https://appointment-booking-3dz0.onrender.com)

> 🚀 **Live Production Deployment:** [https://appointment-booking-3dz0.onrender.com](https://appointment-booking-3dz0.onrender.com)  
> 📖 **Interactive API Documentation:** [https://appointment-booking-3dz0.onrender.com/api/docs](https://appointment-booking-3dz0.onrender.com/api/docs)

---

## 📖 Executive Overview

**ReserveSync** is a robust, production-grade **Multi-Tenant Appointment Booking & Service Marketplace Platform** designed for salons, healthcare clinics, wellness centers, and professional service businesses. 

Engineered with high concurrency safety, real-time WebSockets, transactional slot holds, and automated hiring pipelines, ReserveSync enables multi-industry tenants to operate independent booking portals with custom catalogs, availability rules, and dedicated staffing.

Built from the ground up using **pure Node.js + Express + Prisma ORM + Serverless PostgreSQL (Neon) + Redis + Socket.IO + EJS + Tailwind CSS**.

---

## 📸 Website Workflow & UI Showcase

| 1. Homepage & Featured Marketplace | 2. Real-Time Slot Selection Wizard |
| :---: | :---: |
| ![Homepage](docs/screenshots/01-home-hero.png) | ![Booking Wizard](docs/screenshots/02-booking-wizard.png) |
| *Multi-tenant directory, industry badges, and verified business search* | *12-Hour AM/PM slot grid, staff assignment, and 10-min countdown lock* |

| 3. Seamless Payment Checkout (Razorpay) | 4. Unified "My Bookings" Customer Portal |
| :---: | :---: |
| ![Razorpay Payments](docs/screenshots/03-payment-checkout.png) | ![My Bookings Portal](docs/screenshots/04-my-bookings.png) |
| *UPI QR Code, Netbanking, Cards & HMAC-SHA256 signature verification* | *Multi-tenant booking tracker without raw UUIDs & consultation chats* |

| 5. Business Analytics & Revenue Dashboard | 6. Staff Recruitment & Hiring Pipeline |
| :---: | :---: |
| ![Owner Dashboard](docs/screenshots/05-owner-dashboard.png) | ![Staff Management](docs/screenshots/06-staff-management.png) |
| *Real-time revenue metrics, cancel rates, and upcoming appointment agenda* | *Two-sided hiring hub: public apply page, candidate review & 1-click hiring* |

| 7. Real-Time Messages & Consultation Hub | 8. Multi-Profile Live Notification Bell |
| :---: | :---: |
| ![Chat Hub](docs/screenshots/07-chat-system.png) | ![Notifications Dropdown](docs/screenshots/08-notifications.png) |
| *Dual-channel Socket.IO chat: visitor inquiries & customer booking chats* | *Live in-app alerts, unread counters, and role-aware smart redirection* |

| 9. Modern Split-Panel Auth Suite |
| :---: |
| ![Auth Suite](docs/screenshots/09-auth-split.png) |
| *Fiverr-style split panel: Google OAuth 2.0, JWT tokens & session cookies* |

---

## 🏗️ Architectural Topology

```mermaid
graph TD
    subgraph Clients["Clients & Public Web"]
        Customer["Customer Browser / Mobile"]
        Applicant["Prospective Staff Applicant"]
        Owner["Business Owner Dashboard"]
    end

    subgraph Gateway["Application Layer (Express.js)"]
        Router["Express Router & View Controller"]
        AuthMiddleware["JWT & Session Auth / Google OAuth"]
        RateLimit["Rate Limiting & Helmet Security"]
        SocketServer["Socket.IO Server (Real-Time Rooms)"]
    end

    subgraph Concurrency["Caching & Concurrency Layer"]
        Redis["Redis 7 (Distributed Slot Hold: 10-min TTL)"]
        BullMQ["BullMQ Automated Worker Queue"]
    end

    subgraph DataLayer["Persistence Layer"]
        PrismaClient["Prisma ORM (Connection Pooler & Direct)"]
        Postgres["PostgreSQL 15 (Neon Serverless)"]
    end

    subgraph ThirdParty["External Services & Integrations"]
        Razorpay["Razorpay Gateway (UPI, QR, Cards, Webhooks)"]
        Twilio["Twilio SMS Client"]
        SMTP["Nodemailer (SMTP / MailHog)"]
    end

    Customer -->|Book Slot / Chat / Cancel| RateLimit
    Applicant -->|Submit Application| RateLimit
    Owner -->|Manage Business / Chat / Hire| RateLimit

    RateLimit --> AuthMiddleware --> Router
    Router --> SocketServer
    Router --> Redis
    Router --> PrismaClient

    Redis -->|Hold Slot / Lock| Router
    BullMQ -->|24h & 1h Reminders| SMTP
    BullMQ -->|SMS Alerts| Twilio
    Router --> Razorpay
    PrismaClient --> Postgres
```

---

## ⚡ Engineering Highlights & Core Metrics

| Metric / Mechanism | Technical Specification | Engineering Implementation |
|---|---|---|
| **Concurrency & Double-Booking Guard** | **100% Race-Condition Free** | Redis atomic `SET hold:tenant:staff:slot token EX 600 NX` paired with PostgreSQL exclusion constraints (`EXCLUDE USING gist`) and transactional booking creation. |
| **Slot Hold TTL Window** | **10 Minutes (600 Seconds)** | Redis key expiration automatically triggers slot release if the customer abandons checkout, restoring real-time slot availability. |
| **Payment Verification** | **HMAC-SHA256 Cryptographic Verification** | Dual-tier payment capture: client-side signature hash check + idempotent server-side webhook receiver (`/api/v1/payments/webhook`). |
| **Timezone & Schedule Engine** | **Asia/Kolkata (UTC+5:30) Standard** | Unified 12-Hour AM/PM time format (`09:00 AM – 07:00 PM`) powered by `date-fns-tz` across UI, emails, SMS, and database storage. |
| **Automated Background Reminders** | **24-Hour & 1-Hour Schedule** | BullMQ worker scans upcoming confirmed appointments and dispatches transactional email & SMS reminders with idempotency logging. |
| **Test Suite Coverage** | **76 Tests across 16 Suites (100% Pass Rate)** | Comprehensive Jest test coverage across auth, JWT, datetime, payments, staff recruitment, staff portal, chat sockets, and notifications. |

---

## 🌟 Comprehensive Feature Catalog

### 1. 🏢 Multi-Tenant SaaS Isolation
* **Independent Tenant Spaces:** Businesses receive their own slug (e.g. `/business/radha-beauty-salon`) with dedicated branding, logo, contact details, currency, and timezone.
* **Granular Business Rules:** Configurable lead times (e.g. 1 hour minimum notice), advance booking limits (e.g. 60 days max), cancellation cutoffs (e.g. 24 hours), and buffer minutes between appointments.
* **Operating Hours & Holidays:** Day-of-week operating hours (`09:00 AM – 07:00 PM`) and recurring holiday blackout calendar.

### 2. 🗓️ Smart Availability & Booking Wizard
* **Real-Time Dynamic Slot Calculation:** Factors in staff availability, existing bookings, buffer times, and active Redis hold locks.
* **Unified 12-Hour AM/PM UI:** Intuitive time displays across all customer and owner views.
* **Staff Member Selection:** Customers can choose a specific specialist or opt for "Any Available Specialist".
* **3-Step Clean Checkout Wizard:** Service selection ➔ Date & Time Slot ➔ Customer Info & Payment.

### 3. 💳 100% Upfront Payments (Razorpay)
* **Comprehensive Payment Methods:** Full support for UPI Apps (Google Pay, PhonePe, Paytm, BHIM), dynamic UPI QR code scanning, Netbanking, and Credit/Debit cards.
* **Dual-Layer Verification:** Instant frontend HMAC signature verification + server-to-server webhook callback.
* **Sandbox Simulation Mode:** Seamless testing support without active merchant credentials.

### 4. 👤 Unified Customer "My Bookings" Portal
* **Cross-Tenant Booking Management:** Customers view all their bookings across different salons and clinics in one unified dashboard (`/my-bookings`).
* **Zero UUID Leakage:** Raw database UUIDs are replaced with clean, formatted date and service summaries for optimal user experience.
* **Customer Self-Service Cancellation:** Cancel appointments directly within tenant-permitted cutoff windows.
* **Integrated Consultation Chat:** One-click modal to chat directly with the specialist for any confirmed appointment.

### 5. 💼 Two-Sided Staff Recruitment Pipeline & Onboarding
* **Public Candidate Portal:** Prospective stylists, doctors, and specialists apply at `/business/:slug/apply-staff`.
* **Owner Recruitment Hub:** Business owners review incoming candidate resumes, experience, role titles, and cover notes under `/dashboard/staff`.
* **One-Click Hiring & Auto-Provisioning:** Owners can "Accept & Hire" candidates, which automatically provisions them as active staff members, assigns their eligible services, generates temporary login credentials, and sends welcome emails.

### 6. 🧑‍💼 Dedicated Staff Member Portal & Credentials System
* **Login-Only Security Architecture:** Public registration for role `STAFF` is strictly prohibited. Staff accounts can only be provisioned by authorized business owners or generated via candidate hiring.
* **Scoped Specialist Dashboard (`/staff/dashboard`):** Staff members log in at `/login` and are automatically routed to their personal workspace with 4 focused tabs:
  * **My Appointments:** Filtered agenda displaying only sessions assigned to that specialist (`Today's Sessions`, `Upcoming Appointments`, and `Past & Completed`) with live status updates.
  * **Direct Client Consultation Chat:** Instant one-click consultation chat modal with customers for assigned bookings.
  * **My Schedule & Overrides:** View weekly working hours, request leaves/days off, and submit date-specific custom schedule overrides (`/staff/schedule/override`).
  * **Team Chat with Owner:** Dedicated real-time communication channel connecting the specialist directly with their business owner.
  * **Profile & Security:** Specialist bio, services qualified for, and password updates.
* **Dual-Channel Credential Provisioning:** Business owners can provision existing staff or new hires at any time from `/dashboard/staff` using the "Give Login Access" modal. Credentials (login URL, email, and temporary password) are securely dispatched across two synchronized channels:
  1. **Official Branded Email:** Formatted welcome email with direct sign-in link and temporary password.
  2. **In-App Team Chat:** Initial credentials message automatically posted into the private Owner-Staff chat thread for immediate in-portal retrieval.

### 7. 💬 Triple-Channel Real-Time WebSocket Chat
* **Visitor General Inquiries:** Prospective clients can ask questions directly on the business profile before booking (`inquiry_<sessionId>`).
* **Customer Booking Consultations:** Booked customers can consult with their assigned specialist about styling, allergies, or timing (`booking_<bookingId>`).
* **Owner <-> Staff Team Chat:** Private internal team communication channel between the business owner and their team specialists (`staff_<staffId>`).
* **Owner Messages Hub (`/dashboard/chat`):** Unified 3-tab interface (*General Inquiries*, *Booking Chats*, and *Staff Team*) with conversation search, unread badge counters, and real-time Socket.IO synchronization.

### 8. 🔔 Multi-Profile Notification System
* **Interactive Navbar Bell:** Unread badge counter (`nav-notif-badge`) with a dropdown showing the latest alerts.
* **Smart Contextual Redirection:** Clicking a chat notification dynamically opens the conversation in the Owner Messages Hub, Staff Portal, or Customer Consultation Modal.
* **Actionable Notification Center (`/dashboard/notifications`):** Activity feed with quick "Reply in Chat" actions and complete email/SMS delivery audit logs.

### 9. 📊 Business Intelligence & Analytics
* **Key Performance Metrics:** Real-time calculation of Total Bookings, Confirmed Appointments, Cancellations, Cancellation Rate %, and Total Collected Revenue in INR (₹).
* **Date Range Filtering:** Seamless toggling between 7-day, 30-day, and 90-day performance periods.
* **Upcoming Appointment Agenda:** Live table with status badges and detail links (`/dashboard/bookings/:id`).

### 10. 📚 Interactive Swagger API Docs & Legal Suite
* **Full OpenAPI 3.0 Documentation:** Interactive documentation for all 10 API modules available at `/api/docs`.
* **Public Legal Documents:** Standardized Terms of Service (`/terms`) and Privacy Policy (`/privacy`).

---

## 🛠️ Technology Stack Matrix

| Layer | Technologies | Role in Platform |
|---|---|---|
| **Runtime & Server** | Node.js (v20+ LTS), Express.js | High-performance asynchronous backend and MVC server |
| **Database & ORM** | Neon PostgreSQL, Prisma ORM 5.x | Serverless relational data store with pooling and schema migrations |
| **Cache & Locking** | Redis 7.x (IoRedis) | In-memory atomic slot locking, TTL hold timers, and session caching |
| **Real-Time Sockets** | Socket.IO 4.6+ | Bidirectional real-time notifications and multi-room chat messaging |
| **Background Queues** | BullMQ | Redis-backed asynchronous queue for scheduled 24h & 1h reminder jobs |
| **Payment Gateway** | Razorpay SDK | UPI, QR Code, Cards, Netbanking checkout and webhook verification |
| **Frontend & UI** | EJS, express-ejs-layouts, Tailwind CSS | High-speed server-rendered views with responsive Tailwind styling |
| **Authentication** | JWT, bcrypt, express-session, Passport.js | Dual-layer security (JWT for APIs + Sessions for SSR) and Google OAuth |
| **Documentation** | Swagger UI Express, OpenAPI 3.0 | Centralized interactive API documentation (`/api/docs`) |
| **Testing & CI/CD** | Jest, Supertest, Docker, GitHub Actions | 16 test suites (76 tests) with automated containerized CI pipeline |

---

## 🏢 Pre-Seeded Demonstration Businesses

The platform includes seed data featuring 4 distinct industries and operational appointments:

| Business Name | Category | Public Booking Page | Owner Login (`SecurePass@1`) | Sample Staff Account |
|---|---|---|---|---|
| **Radha Beauty Salon** | Salon & Spa | [`/business/radha-beauty-salon`](https://appointment-booking-3dz0.onrender.com/business/radha-beauty-salon) | `radha@salon.com` | `priya@salon.com` (Senior Stylist) |
| **Aura Dental Care & Clinic** | Dental & Healthcare | [`/business/aura-dental-clinic`](https://appointment-booking-3dz0.onrender.com/business/aura-dental-clinic) | `dr.arun@auradental.com` | `dr.sneha@auradental.com` (Dentist) |
| **Zenith Physiotherapy & Rehab** | Physiotherapy & Fitness | [`/business/zenith-physio-rehab`](https://appointment-booking-3dz0.onrender.com/business/zenith-physio-rehab) | `vikram@zenithphysio.com` | `anita@zenithphysio.com` (Physio) |
| **Urban Kings Men's Grooming** | Men's Salon & Grooming | [`/business/urban-kings-grooming`](https://appointment-booking-3dz0.onrender.com/business/urban-kings-grooming) | `kabir@urbankings.com` | `rohit@urbankings.com` (Stylist) |

---

## 🧑‍💼 Staff Portal & Lifecycle Operational Guide

The platform features an isolated **Staff Portal** designed for specialists, stylists, and clinic practitioners. Below is the operational workflow across Owners, Staff, and Customers:

### 1. 🔒 The Core Security Rule: Login-Only Architecture
* Public registration for role `STAFF` is strictly prohibited at `/register` to prevent unauthorized staff accounts.
* Staff credentials can **only** be created by a Business Owner via:
  1. **Existing Staff Members:** Owner clicks **"Give Login Access"** on `/dashboard/staff`.
  2. **New Hires:** Owner clicks **"Accept & Hire"** on candidate applications (`/business/:slug/apply-staff`), which automatically generates their account.

### 2. 🔑 Dual-Channel Credential Provisioning
When an owner grants portal access from `/dashboard/staff`:
* The owner can generate a secure random password or enter a custom one.
* The backend creates/updates the User account with `role: "STAFF"` and delivers credentials through two synchronized channels:
  * ✉️ **Branded Email:** Official onboarding email containing the login URL, email, and temporary password.
  * 💬 **In-App Team Chat:** Automated welcome message posted directly into the private Owner-Staff chat thread (`staff_<staffId>`).

### 3. 🚪 Scoped Specialist Dashboard (`/staff/dashboard`)
Upon logging in at `/login`, staff members are automatically routed to their scoped dashboard (`/staff/dashboard`). Attempting to access the owner `/dashboard` safely redirects back to `/staff/dashboard`.

The portal provides 4 dedicated workspaces:
* 📅 **My Appointments:** Filtered view displaying only sessions assigned to that specialist (Today, Upcoming, and Past). Staff can mark sessions as *Completed*, *No-Show*, or *Cancelled*, or click **"Chat with Client"** to open a real-time consultation modal.
* ⏰ **My Schedule & Overrides:** Displays weekly working hours and allows staff to submit date-specific day-off requests or custom working hours (`/staff/schedule/override`).
* 💬 **Team Chat with Owner:** Direct real-time Socket.IO chat room with their salon/clinic owner, with complete credentials history and typing indicators.
* 👤 **Profile & Security:** Specialist bio, authorized service qualifications, and password update form.

### 4. 💬 Two-Way Specialist <-> Customer Consultation Chat
* **Customer Side (`/my-bookings`):** Customers view their confirmed appointments and click **"Chat with Specialist"** under their assigned practitioner's name.
* **Staff Side (`/staff/dashboard`):** Specialists click **"Chat with Client"** on their appointment cards to answer pre-session questions, allergies, or timing adjustments in real time.

### 5. ⚡ 2-Minute Quick Test Walkthrough
To test the complete staff workflow on local or production:
1. **Log in as Owner:** Go to `/login` with `radha@salon.com` / `SecurePass@1`.
2. **Provision Access:** Go to `/dashboard/staff`, find *Priya Sharma*, click **"Give Login Access"** (or *Reset Credentials*), and copy or set the password.
3. **Log in as Staff:** Sign out, log in at `/login` as `priya@salon.com` with the password.
4. **Access Staff Portal:** You are instantly routed to `/staff/dashboard` to manage scoped appointments, schedule overrides, and team chats.

---

## 🚀 Quickstart & Local Setup

### 1. Prerequisites
* [Node.js](https://nodejs.org/) (v18 or v20 LTS)
* [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for Redis and optional MailHog)
* PostgreSQL database instance (local or free cloud tier on [Neon.tech](https://neon.tech/))

### 2. Clone Repository & Install Dependencies
```bash
git clone https://github.com/Ravi-667/Appointment-Booking.git
cd Appointment-Booking
npm install
```

### 3. Configure Environment Variables
Copy `.env.example` to create your local `.env`:
```env
PORT=3000
NODE_ENV=development

# Authentication Secrets
JWT_ACCESS_SECRET=your-64-char-hex-access-secret
JWT_REFRESH_SECRET=your-64-char-hex-refresh-secret
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Google OAuth (Optional for local test)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# Database Connection (Neon or local Postgres)
DATABASE_URL="postgresql://user:pass@localhost:5432/booking_dev?sslmode=prefer"
DIRECT_URL="postgresql://user:pass@localhost:5432/booking_dev?sslmode=prefer"

# Redis Cache & Locks
REDIS_HOST=localhost
REDIS_PORT=6379

# Email & SMS (Local MailHog / Twilio)
SMTP_HOST=localhost
SMTP_PORT=1025
EMAIL_FROM=noreply@reservesync.local

# Razorpay Test Credentials
RAZORPAY_KEY_ID=rzp_test_placeholder
RAZORPAY_KEY_SECRET=placeholder
RAZORPAY_WEBHOOK_SECRET=placeholder
```

### 4. Start Infrastructure Containers
```bash
docker compose up -d redis mailhog
```

### 5. Push Schema & Seed Initial Data
```bash
# Push schema to database
npx prisma db push

# Populate 4 diverse businesses, staff, services & active appointments
node prisma/seed.js
```

### 6. Launch Application
```bash
# Development mode with hot-reloading
npm run dev

# Or production start
npm start
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 🧪 Automated Testing Suite

The application includes unit tests and end-to-end integration test suites:

```bash
npm test
```

### Test Suite Summary:
```text
Test Suites: 16 passed, 16 total
Tests:       76 passed, 76 total
Snapshots:   0 total
Time:        6.336 s
```

Key verified test suites:
* `staff-portal.test.js`: Scoped dashboard access, public staff registration restriction, credentials provisioning (Email + Team Chat), and real-time messaging.
* `staff.service.test.js`: Staff application submission, vetting & hiring pipeline.
* `notifications.service.test.js`: In-app notification creation, unread counts, Socket.IO rooms, and role-aware smart redirect links.
* `chat.service.test.js`: Thread resolution (`booking_`, `inquiry_`, `staff_`), message dispatch, and socket room broadcasts.
* `payments.service.test.js`: Razorpay order creation, UPI simulation, and HMAC verification.
* `availability.service.test.js`: Buffer times, lead times, holidays, and 12-hour AM/PM slot generation.
* `datetime.utils.test.js`: 12-hour AM/PM schedule formatters.
* `lookup.test.js`: Multi-tenant customer booking retrieval and UUID hiding.
* `auth.service.test.js`: Registration, login, password reset, and JWT issuance.

---

## 📁 Repository Structure

```
├── .github/workflows/ci.yml       # GitHub Actions CI/CD Pipeline
├── docker/
│   └── Dockerfile.api             # Multi-stage production container build
├── docker-compose.yml             # Local service orchestration (Redis, Kafka, MailHog)
├── docs/
│   └── screenshots/               # High-resolution website workflow screenshots
├── prisma/
│   ├── schema.prisma              # Database models, pooling setup & directUrl
│   └── seed.js                    # Multi-tenant comprehensive seeder
├── src/
│   ├── index.js                   # Application bootstrap, Socket.IO & BullMQ workers
│   ├── app.js                     # Express app, middleware pipeline, EJS locals & Swagger
│   ├── middlewares/               # JWT auth, tenant isolation, Zod validation, error handlers
│   ├── routes/                    # API v1 routes & EJS view controllers
│   ├── services/                  # Business services (Auth, Bookings, Availability, Staff, Chat, Notifications)
│   ├── utils/                     # Prisma client, JWT, Redis client, Swagger spec, Datetime utils
│   └── views/                     # EJS UI templates (Public, Auth, Dashboard, Partials)
├── test/                          # 16 automated Jest test suites (76 tests)
├── nodemon.json                   # Hot-reload configuration tracking src, prisma & .env
└── package.json                   # Dependencies, scripts, and project metadata
```

---

## 🌐 Production Deployment

### 1. Render.com Deployment (Recommended)
1. Fork or push this repository to GitHub.
2. In [Render.com](https://dashboard.render.com/):
   * Create a **Redis instance** (Free Tier).
   * Create a **Web Service** linked to your repository.
   * **Build Command:** `npm install && npx prisma generate && npx prisma db push`
   * **Start Command:** `npm start`
   * Add required environment variables (`DATABASE_URL`, `DIRECT_URL`, `REDIS_HOST`, `REDIS_PORT`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`).
3. Render automatically runs the build and deploys with free managed SSL.

### 2. Docker Deployment
```bash
docker build -f docker/Dockerfile.api -t reservesync-api:latest .
docker run -p 3000:3000 --env-file .env reservesync-api:latest
```

---

## 📄 License
This project is open-source software licensed under the [MIT License](LICENSE).
