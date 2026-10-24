import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import Razorpay from 'razorpay';

@Injectable()
export class PaymentsService {
  private razorpay: Razorpay;

  constructor(private prisma: PrismaService) {
    this.razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID || '',
      key_secret: process.env.RAZORPAY_KEY_SECRET || '',
    });
  }

  async refundPayment(paymentId: string, amount?: number) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment || !payment.razorpay_payment_id) throw new Error('Payment not found');
    const refundAmount = amount || parseFloat(payment.amount.toString());
    const refund = await this.razorpay.payments.refund(payment.razorpay_payment_id, {
      amount: Math.round(refundAmount * 100),
    });
    await this.prisma.refund.create({
      data: {
        payment_id: paymentId,
        razorpay_refund_id: refund.id,
        amount: refundAmount,
        status: 'PENDING',
      },
    });
    return refund;
  }
}
