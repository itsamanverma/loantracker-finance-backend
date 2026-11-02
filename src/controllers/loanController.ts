import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../config/prisma.js';
import { redis } from '../config/redis.js';
import { auditService } from '../services/auditService.js';

const createLoanSchema = z.object({
  customerName: z.string().min(2, 'Customer name must be at least 2 characters'),
  customerMobile: z.string().regex(/^\d{10}$/, 'Mobile number must be 10 digits'),
  amount: z.coerce.number().positive('Amount must be positive'),
  durationMonths: z.coerce
    .number()
    .refine((v) => [2, 3, 6, 12].includes(v), 'Duration must be 2, 3, 6, or 12 months'),
  verificationToken: z.string().min(1, 'Verification token is required'),
  customInterestRate: z.number().min(1).max(50).optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(['PENDING', 'ACTIVE', 'CLOSED', 'DEFAULT']),
});

/**
 * Calculate EMI using the compound reducing-balance formula.
 * emiAmount = P × r(1+r)^n / ((1+r)^n − 1)
 */
function calculateEMI(principal: number, annualRate: number, months: number): number {
  const monthlyRate = annualRate / 12 / 100;
  if (monthlyRate === 0) return principal / months;
  const factor = Math.pow(1 + monthlyRate, months);
  return (principal * monthlyRate * factor) / (factor - 1);
}

export class LoanController {
  static async list(request: FastifyRequest, reply: FastifyReply) {
    const {
      page = '1',
      limit = '10',
      search,
      status,
      sortField = 'createdAt',
      sortDir = 'desc',
    } = request.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    const allowedSortFields = ['createdAt', 'amount', 'emiAmount', 'startDate', 'durationMonths'];
    const sortKey = allowedSortFields.includes(sortField) ? sortField : 'createdAt';
    const sortOrder = sortDir === 'asc' ? 'asc' : 'desc';

    const where: Record<string, unknown> = {};
    if (status) where['status'] = status;
    if (search) {
      where['OR'] = [
        { customerName: { contains: search, mode: 'insensitive' } },
        { customerMobile: { contains: search } },
      ];
    }

    const [loans, total] = await Promise.all([
      prisma.loan.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { [sortKey]: sortOrder },
        include: {
          user: { select: { id: true, fullName: true, email: true } },
        },
      }),
      prisma.loan.count({ where }),
    ]);

    return reply.send({
      success: true,
      data: loans,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  }

  static async getById(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const loanId = parseInt(id);

    const loan = await prisma.loan.findUnique({
      where: { id: loanId },
      include: {
        payments: { orderBy: { installment: 'asc' } },
        user: { select: { id: true, fullName: true, email: true } },
        smsLogs: { orderBy: { sentAt: 'desc' }, take: 10 },
      },
    });

    if (!loan) {
      return reply.status(404).send({ success: false, error: 'Loan not found' });
    }

    return reply.send({ success: true, data: loan });
  }

  static async create(request: FastifyRequest, reply: FastifyReply) {
    const parsed = createLoanSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.errors[0].message });
    }

    const {
      customerName,
      customerMobile,
      amount,
      durationMonths,
      verificationToken,
      customInterestRate,
    } = parsed.data;

    // Validate mobile verification token from Redis
    const cachedToken = await redis.get(`verified:${customerMobile}`);
    if (!cachedToken || cachedToken !== verificationToken) {
      return reply.status(400).send({
        success: false,
        error: 'Customer mobile must be verified before creating a loan. Please re-verify.',
      });
    }

    // Resolve interest rate: custom override OR lookup from interest_rates table
    let resolvedRate: number;
    if (customInterestRate !== undefined) {
      resolvedRate = customInterestRate;
    } else {
      const rateConfig = await prisma.interestRate.findUnique({
        where: { durationMonths },
      });
      if (!rateConfig || !rateConfig.isActive) {
        return reply.status(400).send({
          success: false,
          error: `Interest rate configuration missing or inactive for duration: ${durationMonths} months`,
        });
      }
      resolvedRate = Number(rateConfig.interestRate);
    }

    // Calculate EMI using compound reducing-balance formula
    const emiAmount = calculateEMI(amount, resolvedRate, durationMonths);
    const totalAmount = emiAmount * durationMonths;

    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(startDate.getMonth() + durationMonths);

    const currentUser = request.currentUser!;

    // Atomic transaction: create loan + generate payment schedule
    const loan = await prisma.$transaction(async (tx) => {
      const createdLoan = await tx.loan.create({
        data: {
          userId: currentUser.id,
          customerName,
          customerMobile,
          mobileVerified: true,
          verificationToken,
          amount: new Decimal(amount),
          durationMonths,
          interestRate: new Decimal(resolvedRate),
          emiAmount: new Decimal(emiAmount.toFixed(2)),
          totalAmount: new Decimal(totalAmount.toFixed(2)),
          startDate,
          endDate,
          status: 'PENDING',
        },
      });

      // Generate N installment rows
      const installments = Array.from({ length: durationMonths }, (_, i) => {
        const dueDate = new Date(startDate);
        dueDate.setMonth(startDate.getMonth() + i + 1);
        return {
          loanId: createdLoan.id,
          installment: i + 1,
          dueDate,
          amount: new Decimal(emiAmount.toFixed(2)),
          status: 'PENDING' as const,
        };
      });

      await tx.payment.createMany({ data: installments });
      return createdLoan;
    });

    // Clean up verification token from Redis
    await redis.del(`verified:${customerMobile}`);

    // Write audit log
    await auditService.log({
      userId: currentUser.id,
      action: 'CREATE_LOAN',
      entityType: 'loan',
      entityId: loan.id,
      details: { customerName, customerMobile, amount, durationMonths, resolvedRate },
      ipAddress: request.ip,
    });

    return reply.status(201).send({ success: true, data: loan });
  }

  static async updateStatus(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const loanId = parseInt(id);

    const parsed = updateStatusSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.errors[0].message });
    }

    const { status } = parsed.data;

    const existing = await prisma.loan.findUnique({ where: { id: loanId } });
    if (!existing) {
      return reply.status(404).send({ success: false, error: 'Loan not found' });
    }

    const updated = await prisma.loan.update({
      where: { id: loanId },
      data: { status },
    });

    const currentUser = request.currentUser!;
    await auditService.log({
      userId: currentUser.id,
      action: 'UPDATE_LOAN_STATUS',
      entityType: 'loan',
      entityId: loanId,
      details: { previousStatus: existing.status, newStatus: status },
      ipAddress: request.ip,
    });

    return reply.send({ success: true, data: updated });
  }
}
