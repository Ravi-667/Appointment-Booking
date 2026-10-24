import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { WinstonLoggerService } from './common/services/winston-logger.service';

/**
 * bootstrap — Application entry point.
 *
 * Environment: PORT, NODE_ENV, API_PREFIX
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new WinstonLoggerService(),
    cors: false,
  });

  // --- Security (Helmet) -------------------------------------------------
  app.use(
    helmet({
      contentSecurityPolicy:
        process.env.NODE_ENV === 'production'
          ? {
              directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net'],
                imgSrc: ["'self'", 'data:', 'blob:', 'cdn.jsdelivr.net'],
                scriptSrc: ["'self'", 'cdn.jsdelivr.net'],
                connectSrc: ["'self'", 'https://api.razorpay.com'],
              },
            }
          : {
              directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", 'data:', 'blob:'],
                scriptSrc: ["'self'", "'unsafe-inline'"],
              },
            },
      crossOriginEmbedderPolicy: false,
    }),
  );

  // --- CORS: per-origin whitelist ----------------------------------------
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: 'GET,PUT,PATCH,POST,DELETE,OPTIONS',
    maxAge: 86400,
  });

  // --- Global Validation Pipe --------------------------------------------
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      validateCustomDecorators: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // --- API Global Prefix -------------------------------------------------
  const apiPrefix = process.env.API_PREFIX || 'api/v1';
  app.setGlobalPrefix(apiPrefix);

  // --- Swagger API Documentation -----------------------------------------
  const config = new DocumentBuilder()
    .setTitle('Appointment Booking Platform API')
    .setDescription(
      'Multi-tenant SaaS platform for salons, clinics, gyms & tutors. ' +
        'REST + WebSockets, JWT (RS256) auth, Razorpay payments, Kafka events.',
    )
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .addTag('auth', 'Authentication & authorization')
    .addTag('tenants', 'Business profile, hours, holidays')
    .addTag('services', 'Service catalog')
    .addTag('staff', 'Staff management')
    .addTag('availability', 'Slot availability engine')
    .addTag('bookings', 'Booking lifecycle')
    .addTag('payments', 'Razorpay payments & refunds')
    .addTag('notifications', 'Email / SMS notifications')
    .addTag('analytics', 'Dashboard statistics')
    .addTag('admin', 'Platform administration')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey, methodKey) => methodKey,
  });
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  // --- Prometheus Metrics ------------------------------------------------
  try {
    const promClient = await import('prom-client');
    const collectDefaultMetrics = promClient.collectDefaultMetrics;
    collectDefaultMetrics();
    app.get('/metrics', (req, res) => {
      res.set('Content-Type', promClient.register.contentType);
      res.end(promClient.register.metrics());
    });
  } catch {
    // prom-client not installed — graceful degrade
  }

  // --- Health Checks -----------------------------------------------------
  app.get('/health/live', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/health/ready', async (req, res) => {
    try {
      // TODO: check DB, Redis, Kafka health via injected clients
      res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        dependencies: {
          postgres: 'unknown',
          redis: 'unknown',
          kafka: 'unknown',
        },
      });
    } catch (err) {
      res.status(503).json({ status: 'unavailable', error: err.message });
    }
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`🚀 App running on http://localhost:${port}`);
  console.log(`📖 Swagger docs at http://localhost:${port}/${apiPrefix}/docs`);
  console.log(`📊 Health: http://localhost:${port}/health/live`);
  console.log(`📊 Metrics: http://localhost:${port}/metrics`);
}

bootstrap().catch((err) => {
  console.error('❌ Bootstrap failed:', err);
  process.exit(1);
});
