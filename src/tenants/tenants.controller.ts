import { Controller, Get, Post, Patch, Put, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('tenants')
@Controller('tenants')
export class TenantsController {
  constructor(private tenantsService: TenantsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  create(@Body() dto: any) {
    return this.tenantsService.create(dto);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  findOne(@Param('id') id: string) {
    return this.tenantsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  update(@Param('id') id: string, @Body() dto: any) {
    return this.tenantsService.update(id, dto);
  }

  @Get(':id/hours')
  getHours(@Param('id') id: string) {
    return this.tenantsService.getHours(id);
  }

  @Put(':id/hours')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  updateHours(@Param('id') id: string, @Body() body: any) {
    return this.tenantsService.updateHours(id, body.hours);
  }

  @Get(':id/holidays')
  getHolidays(@Param('id') id: string) {
    return this.tenantsService.getHolidays(id);
  }

  @Post(':id/holidays')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  addHoliday(@Param('id') id: string, @Body() dto: any) {
    return this.tenantsService.addHoliday(id, dto);
  }

  @Delete(':id/holidays/:date')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  removeHoliday(@Param('id') id: string, @Param('date') date: string) {
    return this.tenantsService.removeHoliday(id, date);
  }
}
