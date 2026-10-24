import { Test, TestingModule } from '@nestjs/testing';
import { AvailabilityService } from '../../src/availability/availability.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RedisService } from '../../src/common/redis/redis.service';

describe('AvailabilityService', () => {
  let service: AvailabilityService;
  let prisma: PrismaService;
  let redis: RedisService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AvailabilityService,
        {
          provide: PrismaService,
          useValue: {
            service: { findUnique: jest.fn() },
            tenant: { findUnique: jest.fn() },
            businessHour: { findFirst: jest.fn() },
            holiday: { findFirst: jest.fn() },
            staffSchedule: { findFirst: jest.fn() },
            booking: { findMany: jest.fn() },
            bookingHold: { findMany: jest.fn() },
          },
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AvailabilityService>(AvailabilityService);
    prisma = module.get<PrismaService>(PrismaService);
    redis = module.get<RedisService>(RedisService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return empty array when business is closed', async () => {
    (prisma.service.findUnique as jest.Mock).mockResolvedValue({ duration_minutes: 30, max_concurrent: 1 });
    (prisma.tenant.findUnique as jest.Mock).mockResolvedValue({ timezone: 'Asia/Kolkata', buffer_minutes: 0, booking_lead_time_hours: 1, booking_advance_limit_days: 60 });
    (prisma.businessHour.findFirst as jest.Mock).mockResolvedValue({ is_open: false });
    const result = await service.getAvailability({ serviceId: '1', date: '2024-12-01', tenantId: 't1' });
    expect(result).toEqual([]);
  });
});
