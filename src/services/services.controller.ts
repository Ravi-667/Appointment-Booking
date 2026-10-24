import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ServicesService } from './services.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('services')
@Controller('services')
export class ServicesController {
  constructor(private servicesService: ServicesService) {}

  @Get()
  findAll(@Req() req: any, @Query('all') all: string) {
    const tenantId = req.user?.tenantId || req.headers['x-tenant-id'];
    return this.servicesService.findAll(tenantId, all !== 'true');
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  create(@Req() req: any, @Body() dto: any) {
    return this.servicesService.create(req.user.tenantId, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  update(@Param('id') id: string, @Body() dto: any) {
    return this.servicesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  remove(@Param('id') id: string) {
    return this.servicesService.remove(id);
  }

  @Post(':id/staff')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  assignStaff(@Param('id') id: string, @Body() body: any) {
    return this.servicesService.assignStaff(id, body.staffId);
  }

  @Delete(':id/staff/:staffId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  unassignStaff(@Param('id') id: string, @Param('staffId') staffId: string) {
    return this.servicesService.unassignStaff(id, staffId);
  }
}
