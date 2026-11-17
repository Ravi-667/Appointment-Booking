require("dotenv").config();
const http = require("http");
const { Server } = require("socket.io");
const app = require("./app");
const redis = require("./utils/redis.client");

const PORT = process.env.PORT || 3000;

// Create HTTP server (needed for Socket.io)
const server = http.createServer(app);

// WebSocket for live dashboard
const io = new Server(server, {
  cors: { origin: process.env.ALLOWED_ORIGINS?.split(",") || "*", credentials: true },
  namespace: "/dashboard",
});

const jwt = require("jsonwebtoken");

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("No token"));
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    socket.data.tenantId = payload.tenantId;
    next();
  } catch {
    next(new Error("Invalid token"));
  }
});

io.on("connection", (socket) => {
  if (socket.data.tenantId) {
    socket.join(`tenant:${socket.data.tenantId}`);
    console.log(`WS client joined tenant:${socket.data.tenantId}`);
  }
  socket.on("disconnect", () => {
    console.log(`WS client disconnected: ${socket.id}`);
  });
});

// Export io so services can emit events
app.set("io", io);

// Connect Redis before starting
redis.connect().catch(() => {
  // Redis connect() only needed for lazyConnect, ignore error if already connecting
});

// Start Kafka notification consumer
async function startKafkaConsumer() {
  try {
    const { createConsumer } = require("./utils/kafka.client");
    const notificationsService = require("./services/notifications.service");

    const consumer = await createConsumer("notifications-group");
    await consumer.subscribe({ topics: ["booking.confirmed", "booking.cancelled"], fromBeginning: false });

    await consumer.run({
      eachMessage: async ({ topic, message }) => {
        try {
          const event = JSON.parse(message.value.toString());
          if (topic === "booking.confirmed") {
            await notificationsService.sendBookingConfirmation(event.bookingId);
            // Emit WebSocket event to business owner dashboard
            io.to(`tenant:${event.tenantId}`).emit("booking:confirmed", { bookingId: event.bookingId });
          }
          if (topic === "booking.cancelled") {
            await notificationsService.sendCancellationNotice(event.bookingId);
            io.to(`tenant:${event.tenantId}`).emit("booking:cancelled", { bookingId: event.bookingId });
          }
        } catch (err) {
          console.error("Kafka consumer error:", err.message);
        }
      },
    });

    console.log("✓ Kafka notification consumer running");
  } catch (err) {
    console.warn("Kafka not available (run docker compose up):", err.message);
  }
}

// Start BullMQ cleanup job
async function startCleanupJob() {
  try {
    const { Queue, Worker } = require("bullmq");
    const bookingsService = require("./services/bookings.service");

    const redisConn = {
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379"),
      maxRetriesPerRequest: null,
    };

    const cleanupQueue = new Queue("cleanup", { connection: redisConn });

    // Add repeating job every 5 minutes
    await cleanupQueue.upsertJobScheduler("cleanup-holds", { every: 5 * 60 * 1000 }, { name: "cleanup-expired-holds", data: {} });
    // Add repeating reminder job every 15 minutes
    await cleanupQueue.upsertJobScheduler("send-reminders", { every: 15 * 60 * 1000 }, { name: "send-booking-reminders", data: {} });

    const notificationsService = require("./services/notifications.service");

    new Worker("cleanup", async (job) => {
      if (job.name === "cleanup-expired-holds") {
        await bookingsService.cleanupExpiredHolds();
      } else if (job.name === "send-booking-reminders") {
        await notificationsService.checkAndSendDueReminders();
      }
    }, { connection: redisConn });

    console.log("✓ BullMQ cleanup worker running");
  } catch (err) {
    console.warn("BullMQ worker failed to start:", err.message);
  }
}

server.listen(PORT, async () => {
  console.log(`
✓ Server running at http://localhost:${PORT}`);
  console.log(`✓ API docs at http://localhost:${PORT}/api/docs`);
  console.log(`✓ Mailhog UI at http://localhost:8025`);
  console.log(`✓ Prisma Studio: run "npx prisma studio"\n`);

  const prisma = require("./utils/prisma.client");
  prisma.$connect()
    .then(() => console.log("✓ PostgreSQL connected via Prisma"))
    .catch((err) => console.warn("PostgreSQL not reachable (run docker compose up):", err.message));

  await startKafkaConsumer();
  await startCleanupJob();
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  server.close(() => process.exit(0));
});

