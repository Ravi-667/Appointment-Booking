module.exports = {
  openapi: "3.0.0",
  info: {
    title: "Appointment Booking Platform API",
    version: "1.0.0",
    description: "Production-grade multi-tenant appointment booking, scheduling, real-time messaging, and payment processing REST API.",
    contact: {
      name: "BookingApp Developer Support",
      email: "api@bookingapp.local",
    },
  },
  servers: [
    {
      url: "/api/v1",
      description: "Default API Gateway (v1)",
    },
  ],
  tags: [
    { name: "Authentication", description: "User registration, login, token refresh, and password management" },
    { name: "Tenants & Businesses", description: "Multi-tenant business profile, operating hours, and holiday schedules" },
    { name: "Services", description: "Catalog of bookable services, durations, and pricing" },
    { name: "Staff & Recruitment", description: "Specialists roster, candidate applications, hiring pipeline, and schedules" },
    { name: "Availability", description: "Timezone-aware real-time slot generation and buffer management" },
    { name: "Bookings", description: "Slot reservation holds, confirmation, lookups, cancellation, and rescheduling" },
    { name: "Payments", description: "Razorpay order creation, card/UPI verification, and webhook handling" },
    { name: "Notifications", description: "In-app alerts, unread counting, and multi-channel telemetry" },
    { name: "Chat & Consultations", description: "Dual-mode real-time inquiries and appointment consultations" },
    { name: "Dashboard", description: "Business analytics, KPIs, calendar views, and appointment feeds" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Enter your JWT access token (Bearer <token>)",
      },
    },
    schemas: {
      ErrorResponse: {
        type: "object",
        properties: {
          statusCode: { type: "integer", example: 400 },
          message: { type: "string", example: "Invalid request payload" },
        },
      },
      User: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string", example: "Radha Sharma" },
          email: { type: "string", example: "radha@salon.com" },
          role: { type: "string", example: "BUSINESS_OWNER" },
          tenantId: { type: "string", format: "uuid" },
        },
      },
      Booking: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          tenantId: { type: "string", format: "uuid" },
          serviceId: { type: "string", format: "uuid" },
          staffId: { type: "string", format: "uuid", nullable: true },
          customerName: { type: "string", example: "Ravi Kesharwani" },
          customerEmail: { type: "string", example: "ravi@example.com" },
          customerPhone: { type: "string", example: "+919876543210" },
          startTime: { type: "string", format: "date-time" },
          endTime: { type: "string", format: "date-time" },
          status: { type: "string", enum: ["CONFIRMED", "PENDING_PAYMENT", "CANCELLED", "NO_SHOW"] },
          price: { type: "number", example: 499 },
        },
      },
    },
  },
  paths: {
    // ─── AUTHENTICATION ──────────────────────────────────────────────────────
    "/auth/register": {
      post: {
        tags: ["Authentication"],
        summary: "Register a new user account",
        description: "Creates a new customer or business owner account.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "email", "password", "role"],
                properties: {
                  name: { type: "string", example: "Rahul Verma" },
                  email: { type: "string", example: "rahul@example.com" },
                  password: { type: "string", format: "password", example: "Secret123!" },
                  role: { type: "string", enum: ["CUSTOMER", "BUSINESS_OWNER"], example: "CUSTOMER" },
                  phone: { type: "string", example: "+919876543210" },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "User registered successfully" },
          400: { description: "Validation error or email already in use" },
        },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Authentication"],
        summary: "Sign in with email and password",
        description: "Returns access and refresh JWT tokens.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", example: "radha@salon.com" },
                  password: { type: "string", format: "password", example: "password123" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Successfully authenticated with tokens" },
          401: { description: "Invalid credentials" },
        },
      },
    },
    "/auth/refresh": {
      post: {
        tags: ["Authentication"],
        summary: "Refresh access token",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["refreshToken"],
                properties: { refreshToken: { type: "string" } },
              },
            },
          },
        },
        responses: {
          200: { description: "New access token granted" },
          401: { description: "Invalid or expired refresh token" },
        },
      },
    },
    "/auth/change-password": {
      post: {
        tags: ["Authentication"],
        summary: "Change user password",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["currentPassword", "newPassword"],
                properties: {
                  currentPassword: { type: "string", format: "password" },
                  newPassword: { type: "string", format: "password", minLength: 8 },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Password updated successfully" },
          400: { description: "Incorrect current password or invalid new password" },
          401: { description: "Unauthorized" },
        },
      },
    },

    // ─── TENANTS ─────────────────────────────────────────────────────────────
    "/tenants": {
      get: {
        tags: ["Tenants & Businesses"],
        summary: "List active salons and clinics",
        parameters: [
          { name: "category", in: "query", schema: { type: "string" }, description: "Filter by category" },
        ],
        responses: {
          200: { description: "List of active business profiles" },
        },
      },
      post: {
        tags: ["Tenants & Businesses"],
        summary: "Register a new business profile",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "email"],
                properties: {
                  name: { type: "string", example: "Radha Beauty Salon" },
                  email: { type: "string", example: "radha@salon.com" },
                  category: { type: "string", example: "Salon & Spa" },
                  phone: { type: "string", example: "+919876543210" },
                  address: { type: "string", example: "Civil Lines, Prayagraj" },
                  timezone: { type: "string", default: "Asia/Kolkata" },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Business profile created" },
        },
      },
    },
    "/tenants/{slug}": {
      get: {
        tags: ["Tenants & Businesses"],
        summary: "Get business profile by URL slug",
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" }, example: "radha-beauty-salon" },
        ],
        responses: {
          200: { description: "Business profile details with services and operating hours" },
          404: { description: "Tenant not found" },
        },
      },
    },

    // ─── SERVICES ────────────────────────────────────────────────────────────
    "/services": {
      get: {
        tags: ["Services"],
        summary: "List bookable services for business",
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "Array of service objects" },
        },
      },
      post: {
        tags: ["Services"],
        summary: "Create a new service",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "durationMinutes", "price"],
                properties: {
                  name: { type: "string", example: "Ayurvedic Herbal Facial" },
                  description: { type: "string", example: "Complete skin revitalizing herbal facial" },
                  durationMinutes: { type: "integer", example: 45 },
                  price: { type: "number", example: 999 },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Service created successfully" },
        },
      },
    },

    // ─── STAFF & RECRUITMENT ─────────────────────────────────────────────────
    "/staff": {
      get: {
        tags: ["Staff & Recruitment"],
        summary: "List staff specialists",
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "Array of staff members with assigned services" },
        },
      },
      post: {
        tags: ["Staff & Recruitment"],
        summary: "Add a staff specialist",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: {
                  name: { type: "string", example: "Priya Verma" },
                  roleTitle: { type: "string", example: "Senior Hair Stylist" },
                  email: { type: "string", example: "priya@salon.com" },
                  phone: { type: "string", example: "+919876543210" },
                  bio: { type: "string", example: "8+ years in precision styling" },
                  serviceIds: { type: "array", items: { type: "string" } },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Staff member registered" },
        },
      },
    },
    "/staff/apply": {
      post: {
        tags: ["Staff & Recruitment"],
        summary: "Submit public staff job application",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["applicantName", "email", "roleTitle"],
                properties: {
                  slug: { type: "string", example: "radha-beauty-salon" },
                  applicantName: { type: "string", example: "Sunil Verma" },
                  email: { type: "string", example: "sunil@gmail.com" },
                  phone: { type: "string", example: "+919898989898" },
                  roleTitle: { type: "string", example: "Senior Physiotherapist" },
                  experience: { type: "string", example: "5 years experience" },
                  coverNote: { type: "string", example: "Excited to apply!" },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Application submitted to business owner" },
        },
      },
    },
    "/staff/applications": {
      get: {
        tags: ["Staff & Recruitment"],
        summary: "Owner: List candidate job applications",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "status", in: "query", schema: { type: "string", enum: ["PENDING", "ACCEPTED", "REJECTED"] } },
        ],
        responses: {
          200: { description: "Array of job applications" },
        },
      },
    },
    "/staff/applications/{id}/accept": {
      post: {
        tags: ["Staff & Recruitment"],
        summary: "Owner: Accept and hire candidate into active staff",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  roleTitle: { type: "string" },
                  serviceIds: { type: "array", items: { type: "string" } },
                  notes: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Candidate hired into staff roster" },
        },
      },
    },

    // ─── AVAILABILITY ────────────────────────────────────────────────────────
    "/availability/slots": {
      get: {
        tags: ["Availability"],
        summary: "Fetch real-time available appointment slots",
        description: "Calculates available slots taking into account business hours, existing bookings, buffer times, staff schedules, and holidays.",
        parameters: [
          { name: "tenantId", in: "query", required: true, schema: { type: "string" } },
          { name: "serviceId", in: "query", required: true, schema: { type: "string" } },
          { name: "date", in: "query", required: true, schema: { type: "string", format: "date" }, example: "2026-11-25" },
          { name: "staffId", in: "query", schema: { type: "string" }, description: "Optional specific specialist" },
        ],
        responses: {
          200: {
            description: "List of available slot timestamps",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    slots: { type: "array", items: { type: "string", format: "date-time" } },
                  },
                },
              },
            },
          },
        },
      },
    },

    // ─── BOOKINGS ────────────────────────────────────────────────────────────
    "/bookings/hold": {
      post: {
        tags: ["Bookings"],
        summary: "Place a temporary slot hold",
        description: "Locks a slot for 10 minutes in Redis to prevent concurrent double-booking during checkout.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["tenantId", "serviceId", "startTime"],
                properties: {
                  tenantId: { type: "string", format: "uuid" },
                  serviceId: { type: "string", format: "uuid" },
                  staffId: { type: "string", format: "uuid" },
                  startTime: { type: "string", format: "date-time" },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Hold placed with session token and expiration time" },
          409: { description: "Slot is no longer available" },
        },
      },
    },
    "/bookings/confirm": {
      post: {
        tags: ["Bookings"],
        summary: "Confirm held slot and create booking",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["holdId", "sessionToken", "customerName", "customerEmail"],
                properties: {
                  holdId: { type: "string" },
                  sessionToken: { type: "string" },
                  customerName: { type: "string" },
                  customerEmail: { type: "string" },
                  customerPhone: { type: "string" },
                  notes: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Booking created and ready for payment" },
        },
      },
    },
    "/bookings/my-bookings": {
      get: {
        tags: ["Bookings"],
        summary: "Look up all appointments by customer email across all businesses",
        parameters: [
          { name: "email", in: "query", required: true, schema: { type: "string" }, example: "ravi@example.com" },
        ],
        responses: {
          200: {
            description: "Returns upcoming and past bookings grouped by status",
          },
        },
      },
    },
    "/bookings/{id}/customer-cancel": {
      post: {
        tags: ["Bookings"],
        summary: "Cancel an appointment by customer",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email"],
                properties: {
                  email: { type: "string" },
                  reason: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Booking cancelled and slot released" },
        },
      },
    },

    // ─── PAYMENTS ────────────────────────────────────────────────────────────
    "/payments/order": {
      post: {
        tags: ["Payments"],
        summary: "Generate Razorpay payment order",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["bookingId"],
                properties: { bookingId: { type: "string" } },
              },
            },
          },
        },
        responses: {
          200: { description: "Razorpay order created with order_id and key_id" },
        },
      },
    },
    "/payments/verify": {
      post: {
        tags: ["Payments"],
        summary: "Verify Razorpay signature and capture booking payment",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["bookingId", "razorpayPaymentId", "razorpaySignature"],
                properties: {
                  bookingId: { type: "string" },
                  razorpayOrderId: { type: "string" },
                  razorpayPaymentId: { type: "string" },
                  razorpaySignature: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          200: { description: "Payment verified, appointment confirmed, and receipt sent" },
        },
      },
    },

    // ─── NOTIFICATIONS ───────────────────────────────────────────────────────
    "/notifications": {
      get: {
        tags: ["Notifications"],
        summary: "Fetch in-app notifications and unread counter",
        parameters: [
          { name: "email", in: "query", schema: { type: "string" }, description: "Optional customer email" },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          { name: "unreadOnly", in: "query", schema: { type: "boolean", default: false } },
        ],
        responses: {
          200: {
            description: "Returns notifications array and unreadCount",
          },
        },
      },
    },
    "/notifications/{id}/read": {
      patch: {
        tags: ["Notifications"],
        summary: "Mark a single notification as read",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          200: { description: "Notification marked read" },
        },
      },
    },
    "/notifications/mark-all-read": {
      post: {
        tags: ["Notifications"],
        summary: "Mark all notifications as read for current user/tenant",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { email: { type: "string" } },
              },
            },
          },
        },
        responses: {
          200: { description: "All notifications updated to read" },
        },
      },
    },

    // ─── CHAT & CONSULTATIONS ────────────────────────────────────────────────
    "/chat/messages": {
      get: {
        tags: ["Chat & Consultations"],
        summary: "Fetch messages for conversation thread",
        parameters: [
          { name: "tenantId", in: "query", required: true, schema: { type: "string" } },
          { name: "threadId", in: "query", required: true, schema: { type: "string" } },
        ],
        responses: {
          200: { description: "Thread messages with sender details" },
        },
      },
      post: {
        tags: ["Chat & Consultations"],
        summary: "Send real-time chat message",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["tenantId", "senderType", "senderName", "senderEmail", "message"],
                properties: {
                  tenantId: { type: "string" },
                  threadId: { type: "string" },
                  bookingId: { type: "string" },
                  senderType: { type: "string", enum: ["CUSTOMER", "OWNER", "VISITOR"] },
                  senderName: { type: "string" },
                  senderEmail: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          201: { description: "Message saved and broadcast via WebSocket" },
        },
      },
    },

    // ─── DASHBOARD ───────────────────────────────────────────────────────────
    "/dashboard/stats": {
      get: {
        tags: ["Dashboard"],
        summary: "Get business analytics & revenue KPIs",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "period", in: "query", schema: { type: "string", enum: ["1d", "7d", "30d", "90d"], default: "30d" } },
        ],
        responses: {
          200: { description: "Analytics KPIs: total bookings, confirmation rate, cancellation rate, revenue" },
        },
      },
    },
    "/dashboard/calendar": {
      get: {
        tags: ["Dashboard"],
        summary: "Get day-view appointments for calendar",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "date", in: "query", schema: { type: "string", format: "date" } },
        ],
        responses: {
          200: { description: "List of appointments for the day" },
        },
      },
    },
  },
};
