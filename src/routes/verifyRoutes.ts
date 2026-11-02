import { FastifyInstance } from 'fastify';
import { VerifyController } from '../controllers/verifyController.js';
import { authenticateUser, requirePermission } from '../middleware/authMiddleware.js';

export async function verifyRoutes(fastify: FastifyInstance) {
  fastify.post('/send-otp', {
    schema: {
      tags: ['Verify'],
      summary: 'Send OTP via SMS',
      description: 'Sends a 6-digit OTP to the borrower mobile via AWS SNS. 30s cooldown enforced.',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['mobile'],
        properties: { mobile: { type: 'string', pattern: '^\\d{10}$', example: '9876543210' } },
      },
    },
    preHandler: [authenticateUser, requirePermission('manage_loans')],
  }, VerifyController.sendOtp);

  fastify.post('/verify-otp', {
    schema: {
      tags: ['Verify'],
      summary: 'Verify OTP code',
      description: 'Validates the OTP. On success returns a verificationToken valid for 10 minutes.',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['mobile', 'otp'],
        properties: {
          mobile: { type: 'string', pattern: '^\\d{10}$', example: '9876543210' },
          otp: { type: 'string', minLength: 6, maxLength: 6, example: '123456' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            verified: { type: 'boolean' },
            verificationToken: { type: 'string', description: 'Pass to POST /api/loans' },
          },
        },
      },
    },
    preHandler: [authenticateUser, requirePermission('manage_loans')],
  }, VerifyController.verifyOtp);

  fastify.post('/send-whatsapp', {
    schema: {
      tags: ['Verify'],
      summary: 'Send WhatsApp verification',
      description: 'Sends template message via WhatsApp Business API. Customer replies YES to verify.',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['mobile'],
        properties: { mobile: { type: 'string', pattern: '^\\d{10}$', example: '9876543210' } },
      },
    },
    preHandler: [authenticateUser, requirePermission('manage_loans')],
  }, VerifyController.sendWhatsApp);

  // Public WhatsApp webhook
  fastify.post('/webhooks/whatsapp', {
    schema: {
      tags: ['Verify'],
      summary: 'WhatsApp webhook receiver (public)',
      description: 'Called by WhatsApp Cloud API when customer replies YES to the verification template.',
      security: [],
    },
  }, VerifyController.whatsappWebhook);
}
