import { Controller, Get, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PLATFORM_ADMIN')
@ApiBearerAuth('access-token')
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('tenants')
  getTenants(@Query('page') page: string, @Query('limit') limit: string) {
    return this.adminService.getAllTenants(parseInt(page) || 1, parseInt(limit) || 20);
  }

  @Get('tenants/:id')
  getTenantDetail(@Param('id') id: string) {
    return this.adminService.getTenantDetail(id);
  }

  @Patch('tenants/:id')
  updateTenant(@Param('id') id: string, @Body() dto: any) {
    return this.adminService.updateTenant(id, dto);
  }

  @Get('stats')
  getStats() {
    return this.adminService.getPlatformStats();
  }

  @Get('audit-logs')
  getAuditLogs(@Query('page') page: string, @Query('limit') limit: string) {
    return this.adminService.getAuditLogs(parseInt(page) || 1, parseInt(limit) || 50);
  }
}
