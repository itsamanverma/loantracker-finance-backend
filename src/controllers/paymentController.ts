import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../config/prisma.js';
import { auditService } from '../services/auditService.js';

const recordPaymentSchema = z.object({
  loan_id: z.coerce.number().int().positive('loan_id must be a positive integer'),
  amount: z.coerce.number().positive('Amount must be positive'),
  paid_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'paid_date must be in YYYY-MM-DD format'),
});

export class PaymentController {
  static async list(request: FastifyRequest, reply: FastifyReply) {
    const {
      page = '1',
      limit = '10',
      loanId,
      status,
    } = request.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    const where: Record<string, unknown> = {};
    if (loanId) where['loanId'] = parseInt(loanId);
    if (status) where['status'] = status;

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: [{ loanId: 'asc' }, { installment: 'asc' }],
        include: {
          loan: {
            select: {
              id: true,
              customerName: true,
              customerMobile: true,
              status: true,
            },
          },
        },
      }),
      prisma.payment.count({ where }),
    ]);

    return reply.send({
      success: true,
      data: payments,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  }

  static async record(request: FastifyRequest, reply: FastifyReply) {
    const parsed = recordPaymentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.errors[0].message });
    }

    const { loan_id, amount, paid_date } = parsed.data;

    // Find the next unpaid installment for this loan
    const pendingInstallment = await prisma.payment.findFirst({
      where: {
        loanId: loan_id,
        status: { in: ['PENDING', 'OVERDUE'] },
      },
      orderBy: { installment: 'asc' },
    });

    if (!pendingInstallment) {
      return reply.status(400).send({
        success: false,
        error: 'No pending installments found for this loan. Loan may already be fully paid.',
      });
    }

    // Verify the loan exists
    const loan = await prisma.loan.findUnique({ where: { id: loan_id } });
    if (!loan) {
      return reply.status(404).send({ success: false, error: 'Loan not found' });
    }

    const paidDate = new Date(paid_date);

    // Run payment recording and loan status update in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Record the payment
      const updatedPayment = await tx.payment.update({
        where: { id: pendingInstallment.id },
        data: {
          status: 'PAID',
          paidDate,
          amount: new Decimal(amount.toFixed(2)),
        },
      });

      // Check remaining unpaid installments
      const remainingCount = await tx.payment.count({
        where: {
          loanId: loan_id,
          status: { not: 'PAID' },
        },
      });

      let newLoanStatus = loan.status;

      if (remainingCount === 0) {
        // All installments paid → CLOSED
        newLoanStatus = 'CLOSED';
      } else if (loan.status === 'PENDING') {
        // First payment recorded → ACTIVE
        newLoanStatus = 'ACTIVE';
      }

      if (newLoanStatus !== loan.status) {
        await tx.loan.update({
          where: { id: loan_id },
          data: { status: newLoanStatus },
        });
      }

      return { payment: updatedPayment, newLoanStatus };
    });

    const currentUser = request.currentUser!;
    await auditService.log({
      userId: currentUser.id,
      action: 'RECORD_PAYMENT',
      entityType: 'payment',
      entityId: pendingInstallment.id,
      details: {
        loanId: loan_id,
        installment: pendingInstallment.installment,
        amount,
        paidDate: paid_date,
        newLoanStatus: result.newLoanStatus,
      },
      ipAddress: request.ip,
    });

    return reply.send({ success: true, data: result.payment });
  }
}
