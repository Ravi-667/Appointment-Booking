import { NestFactory } from '@nestjs/core';
import { BullModule } from '@nestjs/bull';
import { Queue } from 'bull';
import { getQueueToken } from '@nestjs/bull';

async function bootstrap() {
  console.log('Worker started - processing BullMQ jobs');
  // TODO: Set up processors for REMINDER_24H, REMINDER_2H, cleanup jobs
  process.on('SIGTERM', () => process.exit(0));
}
bootstrap();
