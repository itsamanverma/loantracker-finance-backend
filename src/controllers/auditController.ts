import { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../config/prisma.js';

export class AuditController {
  static async list(request: FastifyRequest, reply: FastifyReply) {
    const {
      page = '1',
      limit = '25',
      action,
      entityType,
    } = request.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    const where: Record<string, unknown> = {};
    if (action) where['action'] = action;
    if (entityType) where['entityType'] = entityType;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, fullName: true, email: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return reply.send({
      success: true,
      data: logs,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  }
}
