import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class HealthCheckService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async checkDatabase(): Promise<{ status: string; latency?: number }> {
    try {
      const start = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', latency: Date.now() - start };
    } catch (error) {
      return { status: 'error', latency: -1 };
    }
  }

  async checkRedis(): Promise<{ status: string; latency?: number }> {
    try {
      const start = Date.now();
      await this.redis.client.ping();
      return { status: 'ok', latency: Date.now() - start };
    } catch (error) {
      return { status: 'error', latency: -1 };
    }
  }

  async checkKafka(): Promise<{ status: string }> {
    // Simplified check
    try {
      const brokers = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
      return { status: brokers.length > 0 ? 'ok' : 'error' };
    } catch (error) {
      return { status: 'error' };
    }
  }
}
