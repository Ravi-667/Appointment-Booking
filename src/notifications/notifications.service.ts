import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class NotificationsService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'localhost',
      port: parseInt(process.env.SMTP_PORT || '1025'),
      secure: process.env.SMTP_SECURE === 'true',
    });
  }

  async sendEmail(to: string, subject: string, html: string) {
    try {
      await this.transporter.sendMail({
        from: `${process.env.EMAIL_FROM_NAME || 'Booking Platform'} <${process.env.EMAIL_FROM || 'noreply@bookingapp.local'}>`,
        to,
        subject,
        html,
      });
      return { success: true };
    } catch (error) {
      console.error('Email send failed:', error);
      return { success: false, error };
    }
  }
}
