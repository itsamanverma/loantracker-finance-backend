import { FastifyInstance } from 'fastify';
import { PaymentController } from '../controllers/paymentController.js';
import { authenticateUser, requirePermission } from '../middleware/authMiddleware.js';

export async function paymentRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateUser);

  fastify.get('/', {
    schema: {
      tags: ['Payments'],
      summary: 'List payments',
      description: 'Filter by loanId to get installment schedule for a specific loan.',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', default: 1 },
          limit: { type: 'integer', default: 10 },
          loanId: { type: 'integer', description: 'Filter by specific loan' },
          status: { type: 'string', enum: ['PENDING', 'PAID', 'OVERDUE'] },
        },
      },
    },
    preHandler: [requirePermission('manage_payments')],
  }, PaymentController.list);

  fastify.post('/', {
    schema: {
      tags: ['Payments'],
      summary: 'Record a payment installment',
      description: 'Records the next due installment as PAID. Auto-transitions loan to ACTIVE (first payment) or CLOSED (all paid).',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['loan_id', 'amount', 'paid_date'],
        properties: {
          loan_id: { type: 'integer', example: 42 },
          amount: { type: 'number', minimum: 0.01, example: 12500.00 },
          paid_date: { type: 'string', format: 'date', example: '2026-05-27' },
        },
      },
    },
    preHandler: [requirePermission('manage_payments')],
  }, PaymentController.record);
}
