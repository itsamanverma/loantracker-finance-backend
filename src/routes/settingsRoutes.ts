import { FastifyInstance } from 'fastify';
import { SettingsController } from '../controllers/settingsController.js';
import { authenticateUser, requirePermission, requireSuperAdmin } from '../middleware/authMiddleware.js';

export async function settingsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateUser);

  // ── Interest Rates ────────────────────────────────────────────────
  fastify.get('/interest-rates', {
    schema: {
      tags: ['Settings'],
      summary: 'Get all interest rate configs',
      security: [{ bearerAuth: [] }],
    },
    preHandler: [requirePermission('system_config')],
  }, SettingsController.getInterestRates);

  fastify.put('/interest-rates', {
    schema: {
      tags: ['Settings'],
      summary: 'Update interest rate for a duration',
      description: 'SUPER_ADMIN or system_config permission required. Changes affect new loans immediately.',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['durationMonths', 'interestRate'],
        properties: {
          durationMonths: { type: 'integer', enum: [2, 3, 6, 12] },
          interestRate: { type: 'number', minimum: 0.1, maximum: 100, example: 9.5 },
        },
      },
    },
    preHandler: [requirePermission('system_config')],
  }, SettingsController.updateInterestRate);

  // ── User Management ───────────────────────────────────────────────
  fastify.get('/users', {
    schema: { tags: ['Settings'], summary: 'List all system users (SUPER_ADMIN)', security: [{ bearerAuth: [] }] },
    preHandler: [requireSuperAdmin],
  }, SettingsController.listUsers);

  fastify.post('/users', {
    schema: {
      tags: ['Settings'],
      summary: 'Create new user (SUPER_ADMIN)',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['email', 'fullName', 'mobileNo', 'accessType'],
        properties: {
          email: { type: 'string', format: 'email' },
          fullName: { type: 'string', minLength: 2 },
          mobileNo: { type: 'string', pattern: '^\\d{10}$' },
          accessType: { type: 'string', enum: ['ADMIN', 'SUB_ADMIN'] },
          department: { type: 'string', default: 'Operations' },
          permissions: { type: 'array', items: { type: 'string' }, default: [] },
          tempPassword: { type: 'string', minLength: 8, description: 'Default: Admin@123' },
        },
      },
    },
    preHandler: [requireSuperAdmin],
  }, SettingsController.createUser);

  fastify.patch('/users/:id', {
    schema: {
      tags: ['Settings'],
      summary: 'Update user details / permissions (SUPER_ADMIN)',
      security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'integer' } } },
      body: {
        type: 'object',
        properties: {
          fullName: { type: 'string' },
          mobileNo: { type: 'string' },
          department: { type: 'string' },
          permissions: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    preHandler: [requireSuperAdmin],
  }, SettingsController.updateUser);

  fastify.patch('/users/:id/status', {
    schema: {
      tags: ['Settings'],
      summary: 'Toggle user active/inactive (SUPER_ADMIN)',
      description: 'Deactivating also force-logouts the user by deleting their Redis session.',
      security: [{ bearerAuth: [] }],
      params: { type: 'object', properties: { id: { type: 'integer' } } },
      body: {
        type: 'object',
        required: ['isActive'],
        properties: { isActive: { type: 'boolean' } },
      },
    },
    preHandler: [requireSuperAdmin],
  }, SettingsController.toggleUserStatus);
}
