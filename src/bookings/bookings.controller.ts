import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { BookingsService } from './bookings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('bookings')
@Controller('bookings')
export class BookingsController {
  constructor(private bookingsService: BookingsService) {}

  @Post('hold')
  async holdSlot(@Body() dto: any) {
    return this.bookingsService.holdSlot(dto);
  }

  @Post()
  async createBooking(@Body() dto: any) {
    return this.bookingsService.createBooking(dto);
  }

  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  cancel(@Req() req: any, @Body() body: any) {
    return this.bookingsService.cancelBooking(req.params.id, body.reason);
  }

  @Post(':id/reschedule')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  reschedule(@Req() req: any, @Body() body: any) {
    return this.bookingsService.rescheduleBooking(req.params.id, body.newStartTime);
  }
}
