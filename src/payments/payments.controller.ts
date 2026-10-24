import { Controller, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('payments')
@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('access-token')
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Post(':id/refund')
  @Roles('BUSINESS_OWNER', 'PLATFORM_ADMIN')
  async refund(@Param('id') id: string, @Body() body: any) {
    return this.paymentsService.refundPayment(id, body.amount);
  }
}
