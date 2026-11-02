import { FastifyInstance } from 'fastify';
import { LoanController } from '../controllers/loanController.js';
import { authenticateUser, requirePermission } from '../middleware/authMiddleware.js';

export async function loanRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateUser);

  fastify.get('/', {
    schema: {
      tags: ['Loans'],
      summary: 'List and search loans',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', default: 1 },
          limit: { type: 'integer', default: 10 },
          search: { type: 'string', description: 'Search by customer name or mobile' },
          status: { type: 'string', enum: ['PENDING', 'ACTIVE', 'CLOSED', 'DEFAULT'] },
          sortField: { type: 'string', default: 'createdAt' },
          sortDir: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
        },
      },
    },
    preHandler: [requirePermission('manage_loans')],
  }, LoanController.list);

  fastify.get('/:id', {
    schema: {
      tags: ['Loans'],
      summary: 'Get loan details with payment schedule',
      security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'integer' } } },
    },
    preHandler: [requirePermission('manage_loans')],
  }, LoanController.getById);

  fastify.post('/', {
    schema: {
      tags: ['Loans'],
      summary: 'Create a new loan',
      description: 'Requires a verified mobile OTP token. Supports optional custom interest rate override.',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['customerName', 'customerMobile', 'amount', 'durationMonths', 'verificationToken'],
        properties: {
          customerName: { type: 'string', minLength: 2, example: 'Priya Singh' },
          customerMobile: { type: 'string', pattern: '^\\d{10}$', example: '9876543210' },
          amount: { type: 'number', minimum: 1, example: 500000 },
          durationMonths: { type: 'integer', enum: [2, 3, 6, 12], example: 6 },
          verificationToken: { type: 'string', description: 'Token from POST /api/verify/verify-otp' },
          customInterestRate: { type: 'number', minimum: 1, maximum: 50, description: 'Optional override rate (% p.a.)' },
        },
      },
    },
    preHandler: [requirePermission('manage_loans')],
  }, LoanController.create);

  fastify.patch('/:id/status', {
    schema: {
      tags: ['Loans'],
      summary: 'Update loan status',
      security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'integer' } } },
      body: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { type: 'string', enum: ['PENDING', 'ACTIVE', 'CLOSED', 'DEFAULT'] },
        },
      },
    },
    preHandler: [requirePermission('manage_loans')],
  }, LoanController.updateStatus);
}
