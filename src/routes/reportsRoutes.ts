import { FastifyInstance } from 'fastify';
import { ReportsController } from '../controllers/reportsController.js';
import { authenticateUser, requirePermission } from '../middleware/authMiddleware.js';

export async function reportsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateUser);

  fastify.get('/delinquencies', {
    schema: {
      tags: ['Reports'],
      summary: 'List delinquent loans',
      description: 'Returns ACTIVE loans that have at least one OVERDUE installment, with overdue payment details.',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', default: 1 },
          limit: { type: 'integer', default: 20 },
        },
      },
    },
    preHandler: [requirePermission('view_reports')],
  }, ReportsController.delinquencies);
}
