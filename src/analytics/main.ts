import { NestFactory } from '@nestjs/core';
import { KafkaModule } from '../common/kafka/kafka.module';
import { KafkaService } from '../common/kafka/kafka.service';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaModule } from '../prisma/prisma.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext({
    imports: [KafkaModule, PrismaModule],
  });
  const kafka = app.get(KafkaService);
  const prisma = app.get(PrismaService);
  const consumer = kafka.createConsumer('analytics');
  await consumer.connect();
  await consumer.subscribe({ topic: 'booking.confirmed', fromBeginning: false });
  await consumer.subscribe({ topic: 'booking.cancelled', fromBeginning: false });
  await consumer.subscribe({ topic: 'booking.created', fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      const payload = JSON.parse(message.value?.toString() || '{}');
      console.log(`Analytics consumed from ${topic}:`, payload.bookingId);
      // TODO: update rollup tables
    },
  });
  console.log('Analytics consumer started');
}
bootstrap();
