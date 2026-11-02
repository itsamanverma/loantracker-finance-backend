import { FastifyInstance } from 'fastify';
import { SmsController } from '../controllers/smsController.js';
import { authenticateUser, requirePermission } from '../middleware/authMiddleware.js';

export async function smsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateUser);

  fastify.post('/send', {
    schema: {
      tags: ['SMS'],
      summary: 'Send single SMS to a borrower',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['loanId', 'mobile', 'message'],
        properties: {
          loanId: { type: 'integer', example: 42 },
          mobile: { type: 'string', pattern: '^\\d{10}$', example: '9876543210' },
          message: { type: 'string', maxLength: 160, example: 'Dear Priya, your EMI of ₹12500 is due on 2026-06-01. — LoanTracker' },
        },
      },
    },
    preHandler: [requirePermission('manage_loans')],
  }, SmsController.send);

  fastify.post('/broadcast', {
    schema: {
      tags: ['SMS'],
      summary: 'Bulk SMS broadcast to delinquent borrowers',
      description: 'Supports merge tags: {{name}}, {{amount}}, {{due_date}}',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['loanIds', 'template'],
        properties: {
          loanIds: { type: 'array', items: { type: 'integer' }, minItems: 1, example: [1, 2, 3] },
          template: { type: 'string', example: 'Dear {{name}}, your overdue EMI of ₹{{amount}} was due on {{due_date}}. Please pay now.' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            dispatched: { type: 'integer' },
            failed: { type: 'integer' },
          },
        },
      },
    },
    preHandler: [requirePermission('manage_loans')],
  }, SmsController.broadcast);
}
