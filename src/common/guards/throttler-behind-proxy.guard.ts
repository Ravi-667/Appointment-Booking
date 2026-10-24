import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class ThrottlerBehindProxyGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    // Get IP from proxy headers
    request.ip = request.headers['x-forwarded-for']?.split(',')[0] || request.connection.remoteAddress;
    return true;
  }
}
