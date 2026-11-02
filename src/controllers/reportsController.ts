import { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../config/prisma.js';

export class ReportsController {
  static async delinquencies(request: FastifyRequest, reply: FastifyReply) {
    const { page = '1', limit = '20' } = request.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    // Loans with status ACTIVE that have at least one OVERDUE payment
    const [loans, total] = await Promise.all([
      prisma.loan.findMany({
        where: {
          status: 'ACTIVE',
          payments: { some: { status: 'OVERDUE' } },
        },
        include: {
          payments: {
            where: { status: 'OVERDUE' },
            orderBy: { installment: 'asc' },
          },
        },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.loan.count({
        where: {
          status: 'ACTIVE',
          payments: { some: { status: 'OVERDUE' } },
        },
      }),
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
}
