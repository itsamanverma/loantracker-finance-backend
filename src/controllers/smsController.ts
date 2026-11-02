import { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../config/prisma.js';
import { smsService } from '../services/smsService.js';
import { auditService } from '../services/auditService.js';
import { z } from 'zod';

const sendSmsSchema = z.object({
  loanId: z.coerce.number().int().positive(),
  mobile: z.string().regex(/^\d{10}$/),
  message: z.string().min(1).max(160),
});

const broadcastSchema = z.object({
  loanIds: z.array(z.coerce.number().int().positive()).min(1),
  template: z.string().min(1, 'SMS template is required'),
});

export class SmsController {
  static async send(request: FastifyRequest, reply: FastifyReply) {
    const parsed = sendSmsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.errors[0].message });
    }

    const { loanId, mobile, message } = parsed.data;

    let smsStatus = 'SENT';
    try {
      await smsService.send(mobile, message);
    } catch (err) {
      console.error('SMS send failed:', err);
      smsStatus = 'FAILED';
    }

    await prisma.smsLog.create({
      data: { loanId, customerMobile: mobile, messageContent: message, status: smsStatus },
    });

    const currentUser = request.currentUser!;
    await auditService.log({
      userId: currentUser.id,
      action: 'SMS_BROADCAST',
      entityType: 'loan',
      entityId: loanId,
      details: { mobile, status: smsStatus },
      ipAddress: request.ip,
    });

    return reply.send({ success: true, status: smsStatus });
  }

  static async broadcast(request: FastifyRequest, reply: FastifyReply) {
    const parsed = broadcastSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.errors[0].message });
    }

    const { loanIds, template } = parsed.data;

    // Fetch all target loans with their overdue installments
    const loans = await prisma.loan.findMany({
      where: { id: { in: loanIds } },
      include: {
        payments: {
          where: { status: 'OVERDUE' },
          orderBy: { installment: 'asc' },
          take: 1,
        },
      },
    });

    let dispatched = 0;
    let failed = 0;

    for (const loan of loans) {
      const overduePayment = loan.payments[0];
      const dueDate = overduePayment
        ? overduePayment.dueDate.toISOString().split('T')[0]
        : 'N/A';
      const overdueAmount = overduePayment ? overduePayment.amount.toString() : loan.emiAmount.toString();

      // Interpolate template merge tags
      const message = template
        .replace(/{{name}}/g, loan.customerName)
        .replace(/{{amount}}/g, overdueAmount)
        .replace(/{{due_date}}/g, dueDate);

      let status = 'SENT';
      try {
        await smsService.send(loan.customerMobile, message);
      } catch {
        status = 'FAILED';
      }

      await prisma.smsLog.create({
        data: {
          loanId: loan.id,
          customerMobile: loan.customerMobile,
          messageContent: message,
          status,
        },
      });

      if (status === 'SENT') dispatched++;
      else failed++;
    }

    const currentUser = request.currentUser!;
    await auditService.log({
      userId: currentUser.id,
      action: 'SMS_BROADCAST',
      entityType: 'loan',
      details: { count: loanIds.length, dispatched, failed },
      ipAddress: request.ip,
    });

    return reply.send({ success: true, dispatched, failed });
  }
}
