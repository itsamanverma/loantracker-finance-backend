import { FastifyInstance } from 'fastify';
import { AuditController } from '../controllers/auditController.js';
import { authenticateUser, requirePermission } from '../middleware/authMiddleware.js';

export async function auditRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateUser);

  fastify.get('/', {
    schema: {
      tags: ['Audit'],
      summary: 'View audit log trail',
      description: 'Append-only log of all sensitive actions. Filter by action type or entity type.',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', default: 1 },
          limit: { type: 'integer', default: 25 },
          action: {
            type: 'string',
            enum: ['CREATE_USER', 'UPDATE_USER', 'DEACTIVATE_USER', 'CREATE_LOAN', 'UPDATE_LOAN_STATUS', 'RECORD_PAYMENT', 'UPDATE_INTEREST_RATES', 'EXPORT_DATA', 'SMS_BROADCAST'],
          },
          entityType: { type: 'string', enum: ['loan', 'payment', 'user', 'config'] },
        },
      },
    },
    preHandler: [requirePermission('audit_logs')],
  }, AuditController.list);
}
