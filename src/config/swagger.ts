import { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

/**
 * Centralised Swagger / OpenAPI 3 specification.
 *
 * Security schemes:
 *   bearerAuth — JWT access token for all protected endpoints (standard login flow)
 *   apiKeyAuth  — X-API-Key header for Swagger UI access / direct API testing
 */
export async function registerSwagger(fastify: FastifyInstance, apiKey: string) {
  await fastify.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'LoanTracker Pro API',
        description: `
## LoanTracker Pro — Monolithic REST API

**Authentication options:**

| Method | How |
|--------|-----|
| **Bearer JWT** | Login → copy \`accessToken\` → click 🔒 → paste \`<token>\` |
| **API Key** | Add \`X-API-Key: ${apiKey}\` to any request header |

> JWT tokens expire in **15 minutes**. Use \`POST /api/auth/refresh\` to rotate.
        `.trim(),
        version: '2.1.0',
        contact: {
          name: 'LoanTracker Engineering',
          email: 'dev@loantracker.in',
        },
        license: { name: 'Private' },
      },
      servers: [
        { url: 'http://localhost:3000', description: 'Local Dev' },
        {
          url: 'https://{tunnel}.a.pinggy.io',
          description: 'Pinggy Tunnel',
          variables: { tunnel: { default: 'your-tunnel-id' } },
        },
        {
          url: 'https://{subdomain}.trycloudflare.com',
          description: 'Cloudflare Tunnel',
          variables: { subdomain: { default: 'your-tunnel-subdomain' } },
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'JWT access token from POST /api/auth/login',
          },
          apiKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key',
            description: `Static API key for Swagger testing. Current value: \`${apiKey}\``,
          },
        },
      },
      security: [{ bearerAuth: [] }, { apiKeyAuth: [] }],
      tags: [
        { name: 'Auth',      description: 'Login, logout, token refresh, profile' },
        { name: 'Dashboard', description: 'KPI metrics and activity feeds' },
        { name: 'Loans',     description: 'Loan lifecycle management' },
        { name: 'Payments',  description: 'Installment recording and tracking' },
        { name: 'Verify',    description: 'Mobile OTP and WhatsApp verification' },
        { name: 'SMS',       description: 'Single and bulk SMS broadcasting' },
        { name: 'Reports',   description: 'Delinquency and analytics reports' },
        { name: 'Export',    description: 'CSV and JSON data exports' },
        { name: 'Settings',  description: 'Interest rates and user management (SUPER_ADMIN)' },
        { name: 'Audit',     description: 'Immutable audit log trail' },
        { name: 'System',    description: 'Health check and system status' },
      ],
    },
    hideUntagged: false,
  });

  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      displayRequestDuration: true,
      filter: true,
      persistAuthorization: true,
      syntaxHighlight: { theme: 'monokai', activate: true },
    },
    staticCSP: false,
    logo: {
      type: 'image/svg+xml',
      content: Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
          <rect width="100" height="100" rx="20" fill="#1a1a2e"/>
          <text x="50" y="68" font-size="55" text-anchor="middle" fill="#00d4ff">₹</text>
        </svg>`
      ).toString('base64'),
    },
    theme: {
      title: 'LoanTracker Pro API',
      css: [
        {
          filename: 'theme.css',
          content: `
            body { background: #0d0d1a !important; }
            .swagger-ui .topbar { background: #1a1a2e !important; }
            .swagger-ui .info .title { color: #00d4ff !important; }
            .swagger-ui .scheme-container { background: #1a1a2e !important; }
          `,
        },
      ],
    },
  });
}
