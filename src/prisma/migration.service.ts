import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MigrationService implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    // In production, migrations are run separately via `prisma migrate deploy`
    // This is for safety checks only
    if (process.env.NODE_ENV === 'production') {
      console.log('Production mode: ensure migrations are applied with `prisma migrate deploy`');
    }
  }
}
