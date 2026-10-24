import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const params = request.params;

    // If resource has tenantId in params, verify it matches user's tenant
    if (params.tenantId && user?.tenantId && params.tenantId !== user.tenantId) {
      // Platform admins can access any tenant
      if (user.role === 'PLATFORM_ADMIN') {
        return true;
      }
      throw new ForbiddenException('Access denied to this tenant resource');
    }

    return true;
  }
}
