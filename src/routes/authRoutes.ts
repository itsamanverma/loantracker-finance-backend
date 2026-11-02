import { FastifyInstance } from 'fastify';
import { AuthController } from '../controllers/authController.js';
import { authenticateUser } from '../middleware/authMiddleware.js';

export async function authRoutes(fastify: FastifyInstance) {
  // ── POST /api/auth/login ──────────────────────────────────────────
  fastify.post(
    '/login',
    {
      schema: {
        tags: ['Auth'],
        summary: 'User login',
        description: 'Authenticates a user and returns JWT access + refresh tokens.',
        security: [],  // Public — no auth required
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email', example: 'admin@loantracker.in' },
            password: { type: 'string', minLength: 6, example: 'Admin@123' },
          },
        },
        response: {
          200: {
            description: 'Login successful',
            type: 'object',
            properties: {
              accessToken: { type: 'string' },
              refreshToken: { type: 'string' },
              user: {
                type: 'object',
                properties: {
                  id: { type: 'integer' },
                  email: { type: 'string' },
                  full_name: { type: 'string' },
                  access_type: { type: 'string', enum: ['SUPER_ADMIN', 'ADMIN', 'SUB_ADMIN'] },
                  department: { type: 'string' },
                  permissions: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
          401: { description: 'Invalid credentials', type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'string' } } },
          403: { description: 'Account deactivated', type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'string' } } },
        },
      },
    },
    AuthController.login
  );

  // ── POST /api/auth/refresh ────────────────────────────────────────
  fastify.post(
    '/refresh',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Rotate access token',
        description: 'Exchange a valid refresh token for a new access + refresh token pair.',
        security: [],
        body: {
          type: 'object',
          required: ['refreshToken'],
          properties: {
            refreshToken: { type: 'string', description: 'Refresh token from login response' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              accessToken: { type: 'string' },
              refreshToken: { type: 'string' },
            },
          },
        },
      },
    },
    AuthController.refresh
  );

  // ── POST /api/auth/logout ─────────────────────────────────────────
  fastify.post(
    '/logout',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Logout',
        description: 'Invalidates the active session by deleting the Redis refresh token.',
        security: [{ bearerAuth: [] }],
        response: {
          200: { type: 'object', properties: { success: { type: 'boolean' } } },
        },
      },
      preHandler: [authenticateUser],
    },
    AuthController.logout
  );

  // ── GET /api/auth/me ──────────────────────────────────────────────
  fastify.get(
    '/me',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Get own profile',
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  id: { type: 'integer' },
                  email: { type: 'string' },
                  fullName: { type: 'string' },
                  mobileNo: { type: 'string' },
                  accessType: { type: 'string' },
                  department: { type: 'string' },
                  permissions: { type: 'array', items: { type: 'string' } },
                  loginCount: { type: 'integer' },
                  lastLogin: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
      },
      preHandler: [authenticateUser],
    },
    AuthController.me
  );

  // ── PATCH /api/auth/me ────────────────────────────────────────────
  fastify.patch(
    '/me',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Update own profile',
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            fullName: { type: 'string', minLength: 2 },
            mobileNo: { type: 'string' },
            department: { type: 'string' },
          },
        },
      },
      preHandler: [authenticateUser],
    },
    AuthController.updateMe
  );
}
