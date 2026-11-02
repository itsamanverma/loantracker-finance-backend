import { FastifyInstance } from 'fastify';
import { ExportController } from '../controllers/exportController.js';
import { authenticateUser, requirePermission } from '../middleware/authMiddleware.js';

export async function exportRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateUser);

  fastify.get('/loans', {
    schema: {
      tags: ['Export'],
      summary: 'Export loans as CSV or JSON',
      description: 'Triggers a file download. Set `format=csv` or `format=json`. Supports date range and status filters.',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          startDate: { type: 'string', format: 'date', example: '2026-01-01' },
          endDate: { type: 'string', format: 'date', example: '2026-05-31' },
          status: { type: 'string', enum: ['PENDING', 'ACTIVE', 'CLOSED', 'DEFAULT'] },
          format: { type: 'string', enum: ['csv', 'json'], default: 'csv' },
        },
      },
    },
    preHandler: [requirePermission('export_data')],
  }, ExportController.exportLoans);
}
