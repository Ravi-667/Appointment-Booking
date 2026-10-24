import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { StaffService } from './staff.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('staff')
@Controller('staff')
export class StaffController {
  constructor(private staffService: StaffService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  findAll(@Req() req: any) {
    return this.staffService.findAll(req.user.tenantId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  create(@Req() req: any, @Body() dto: any) {
    return this.staffService.create(req.user.tenantId, dto);
  }

  @Post('invite')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  invite(@Req() req: any, @Body() dto: any) {
    return this.staffService.invite(req.user.tenantId, dto);
  }

  @Get(':id/schedule')
  getSchedule(@Param('id') id: string, @Query('month') month: string) {
    return this.staffService.getSchedule(id, month);
  }

  @Put(':id/schedule/:date')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  setSchedule(@Param('id') id: string, @Param('date') date: string, @Body() dto: any) {
    return this.staffService.setSchedule(id, date, dto);
  }

  @Delete(':id/schedule/:date')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  removeSchedule(@Param('id') id: string, @Param('date') date: string) {
    return this.staffService.removeSchedule(id, date);
  }
}
