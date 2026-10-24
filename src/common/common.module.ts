import { Module } from '@nestjs/common';
import { CommonService } from './services/common.service';
import { WinstonLoggerService } from './services/winston-logger.service';
import { MetricsService } from './services/metrics.service';
import { ValidationService } from './services/validation.service';

@Module({
  providers: [CommonService, WinstonLoggerService, MetricsService, ValidationService],
  exports: [CommonService, WinstonLoggerService, MetricsService, ValidationService],
})
export class CommonModule {}
