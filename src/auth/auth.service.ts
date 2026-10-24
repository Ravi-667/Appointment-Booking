import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { RedisService } from '../common/redis/redis.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private redis: RedisService,
  ) {}

  async register(dto: any) {
    // Hash password with bcrypt (rounds: 12)
    const passwordHash = await bcrypt.hash(dto.password, 12);
    // Generate 32-byte token
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        password_hash: passwordHash,
        role: dto.role || 'CUSTOMER',
        email_verify_token: tokenHash,
        email_verify_token_exp: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // TODO: Send verification email via NotificationsService
    return { message: 'Registration successful. Please check your email to verify your account.' };
  }

  async verifyEmail(token: string) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await this.prisma.user.findFirst({
      where: {
        email_verify_token: tokenHash,
        email_verify_token_exp: { gt: new Date() },
      },
    });
    if (!user) throw new UnauthorizedException('Invalid or expired token');
    await this.prisma.user.update({
      where: { id: user.id },
      data: { email_verified: true, email_verify_token: null, email_verify_token_exp: null },
    });
    return { message: 'Email verified successfully' };
  }

  async login(dto: any) {
    const user = await this.prisma.user.findFirst({ where: { email: dto.email } });
    if (!user || !user.password_hash) throw new UnauthorizedException('Invalid credentials');
    if (!user.email_verified) throw new UnauthorizedException('Please verify your email');
    const valid = await bcrypt.compare(dto.password, user.password_hash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const payload = { sub: user.id, email: user.email, role: user.role, tenantId: user.tenant_id };
    const accessToken = this.jwtService.sign(payload, {
      algorithm: 'RS256',
      privateKey: process.env.JWT_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
      issuer: process.env.JWT_ISSUER,
    });
    const refreshToken = this.jwtService.sign(payload, {
      algorithm: 'RS256',
      privateKey: process.env.JWT_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
      issuer: process.env.JWT_ISSUER,
    });
    const refreshHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await this.redis.set(`refresh:${user.id}`, refreshHash, 7 * 24 * 60 * 60);

    return { accessToken, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        algorithms: ['RS256'],
        publicKey: process.env.JWT_PUBLIC_KEY?.replace(/\\n/g, '\n'),
        issuer: process.env.JWT_ISSUER,
      });
      const stored = await this.redis.get(`refresh:${payload.sub}`);
      const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      if (!stored || stored !== hash) throw new UnauthorizedException('Token revoked');
      // Rotation
      await this.redis.del(`refresh:${payload.sub}`);
      const accessToken = this.jwtService.sign({ sub: payload.sub, email: payload.email, role: payload.role, tenantId: payload.tenantId }, {
        algorithm: 'RS256',
        privateKey: process.env.JWT_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
        issuer: process.env.JWT_ISSUER,
      });
      const newRefresh = this.jwtService.sign({ sub: payload.sub, email: payload.email, role: payload.role, tenantId: payload.tenantId }, {
        algorithm: 'RS256',
        privateKey: process.env.JWT_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
        issuer: process.env.JWT_ISSUER,
      });
      await this.redis.set(`refresh:${payload.sub}`, crypto.createHash('sha256').update(newRefresh).digest('hex'), 7 * 24 * 60 * 60);
      return { accessToken, refreshToken: newRefresh };
    } catch (e) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(userId: string) {
    await this.redis.del(`refresh:${userId}`);
    return { message: 'Logged out successfully' };
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findFirst({ where: { email } });
    if (!user) return { message: 'If the email exists, a reset link has been sent' };
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await this.prisma.user.update({
      where: { id: user.id },
      data: { password_reset_token: tokenHash, password_reset_token_exp: new Date(Date.now() + 60 * 60 * 1000) },
    });
    // TODO: send email
    return { message: 'If the email exists, a reset link has been sent' };
  }

  async resetPassword(token: string, password: string) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await this.prisma.user.findFirst({
      where: { password_reset_token: tokenHash, password_reset_token_exp: { gt: new Date() } },
    });
    if (!user) throw new UnauthorizedException('Invalid or expired token');
    const passwordHash = await bcrypt.hash(password, 12);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { password_hash: passwordHash, password_reset_token: null, password_reset_token_exp: null },
    });
    await this.redis.del(`refresh:${user.id}`);
    return { message: 'Password reset successful' };
  }
}
