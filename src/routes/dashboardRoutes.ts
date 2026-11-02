import { FastifyInstance } from 'fastify';
import { DashboardController } from '../controllers/dashboardController.js';
import { authenticateUser } from '../middleware/authMiddleware.js';

export async function dashboardRoutes(fastify: FastifyInstance) {
  fastify.get('/stats', {
    schema: {
      tags: ['Dashboard'],
      summary: 'Get KPI metrics and activity feeds',
      description: 'Returns total/active/closed loans, disbursed/collected amounts, overdue counts, monthly chart data, and recent activity feeds.',
      security: [{ bearerAuth: [] }],
    },
    preHandler: [authenticateUser],
  }, DashboardController.stats);
}
