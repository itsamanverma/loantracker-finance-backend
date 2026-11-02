import { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../config/prisma.js';
import { auditService } from '../services/auditService.js';

type ExportFormat = 'csv' | 'json';

function toCsv(loans: Record<string, unknown>[]): string {
  if (loans.length === 0) return '';
  const headers = Object.keys(loans[0]);
  const rows = loans.map((loan) =>
    headers.map((h) => {
      const val = loan[h];
      const str = val === null || val === undefined ? '' : String(val);
      return `"${str.replace(/"/g, '""')}"`;
    }).join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

export class ExportController {
  static async exportLoans(request: FastifyRequest, reply: FastifyReply) {
    const {
      startDate,
      endDate,
      status,
      format = 'csv',
    } = request.query as Record<string, string>;

    const exportFormat: ExportFormat = format === 'json' ? 'json' : 'csv';

    const where: Record<string, unknown> = {};
    if (status) where['status'] = status;
    if (startDate || endDate) {
      where['createdAt'] = {
        ...(startDate ? { gte: new Date(startDate) } : {}),
        ...(endDate ? { lte: new Date(`${endDate}T23:59:59.999Z`) } : {}),
      };
    }

    const loans = await prisma.loan.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        customerName: true,
        customerMobile: true,
        amount: true,
        durationMonths: true,
        interestRate: true,
        emiAmount: true,
        totalAmount: true,
        startDate: true,
        endDate: true,
        status: true,
        createdAt: true,
      },
    });

    const currentUser = request.currentUser!;
    await auditService.log({
      userId: currentUser.id,
      action: 'EXPORT_DATA',
      entityType: 'loan',
      details: { recordCount: loans.length, format: exportFormat, filters: { startDate, endDate, status } },
      ipAddress: request.ip,
    });

    const today = new Date().toISOString().split('T')[0];

    if (exportFormat === 'csv') {
      const flatLoans = loans.map((l) => ({
        id: l.id,
        customerName: l.customerName,
        customerMobile: l.customerMobile,
        amount: l.amount.toString(),
        durationMonths: l.durationMonths,
        interestRate: l.interestRate.toString(),
        emiAmount: l.emiAmount.toString(),
        totalAmount: l.totalAmount.toString(),
        startDate: l.startDate.toISOString().split('T')[0],
        endDate: l.endDate.toISOString().split('T')[0],
        status: l.status,
        createdAt: l.createdAt.toISOString(),
      }));

      const csv = toCsv(flatLoans as Record<string, unknown>[]);
      return reply
        .header('Content-Type', 'text/csv')
        .header('Content-Disposition', `attachment; filename="loans_export_${today}.csv"`)
        .send(csv);
    }

    return reply
      .header('Content-Type', 'application/json')
      .header('Content-Disposition', `attachment; filename="loans_export_${today}.json"`)
      .send(JSON.stringify(loans, null, 2));
  }
}
