import { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../config/prisma.js';

export class DashboardController {
  static async stats(request: FastifyRequest, reply: FastifyReply) {
    // Run all aggregate queries in parallel for performance
    const [
      totalLoans,
      activeLoans,
      closedLoans,
      pendingLoans,
      defaultLoans,
      disbursedSum,
      collectedSum,
      overdueCount,
      pendingPaymentCount,
      recentLoans,
      recentPayments,
      monthlyCollections,
    ] = await Promise.all([
      prisma.loan.count(),
      prisma.loan.count({ where: { status: 'ACTIVE' } }),
      prisma.loan.count({ where: { status: 'CLOSED' } }),
      prisma.loan.count({ where: { status: 'PENDING' } }),
      prisma.loan.count({ where: { status: 'DEFAULT' } }),

      // Total principal disbursed
      prisma.loan.aggregate({ _sum: { amount: true } }),

      // Total collected (paid payments)
      prisma.payment.aggregate({
        where: { status: 'PAID' },
        _sum: { amount: true },
      }),

      // Overdue installments count
      prisma.payment.count({ where: { status: 'OVERDUE' } }),

      // Pending installments count
      prisma.payment.count({ where: { status: 'PENDING' } }),

      // 5 most recent loans
      prisma.loan.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          customerName: true,
          customerMobile: true,
          amount: true,
          status: true,
          createdAt: true,
        },
      }),

      // 5 most recent paid payments
      prisma.payment.findMany({
        take: 5,
        where: { status: 'PAID' },
        orderBy: { paidDate: 'desc' },
        select: {
          id: true,
          loanId: true,
          installment: true,
          amount: true,
          paidDate: true,
          loan: {
            select: { customerName: true, customerMobile: true },
          },
        },
      }),

      // Last 12 months collection summary (raw aggregation via groupBy by month)
      prisma.$queryRaw<Array<{ month: string; amount: number }>>`
        SELECT
          TO_CHAR(DATE_TRUNC('month', "paid_date"), 'YYYY-MM') AS month,
          SUM(amount)::float AS amount
        FROM payments
        WHERE status = 'PAID'
          AND paid_date >= NOW() - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', "paid_date")
        ORDER BY DATE_TRUNC('month', "paid_date") DESC
      `,
    ]);

    return reply.send({
      success: true,
      data: {
        totalLoans,
        activeLoans,
        closedLoans,
        pendingLoans,
        defaultLoans,
        totalDisbursed: Number(disbursedSum._sum.amount ?? 0),
        totalCollected: Number(collectedSum._sum.amount ?? 0),
        overduePayments: overdueCount,
        pendingPayments: pendingPaymentCount,
        loansByStatus: [
          { status: 'ACTIVE', count: activeLoans },
          { status: 'CLOSED', count: closedLoans },
          { status: 'PENDING', count: pendingLoans },
          { status: 'DEFAULT', count: defaultLoans },
        ],
        monthlyCollections,
        recentLoans,
        recentPayments,
      },
    });
  }
}
