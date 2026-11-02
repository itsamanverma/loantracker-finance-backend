import Fastify, { FastifyError } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import compress from '@fastify/compress';

import { env } from './config/env.js';
import { redis } from './config/redis.js';
import { prisma } from './config/prisma.js';
import { registerSwagger } from './config/swagger.js';

// Routes
import { authRoutes } from './routes/authRoutes.js';
import { loanRoutes } from './routes/loanRoutes.js';
import { paymentRoutes } from './routes/paymentRoutes.js';
import { verifyRoutes } from './routes/verifyRoutes.js';
import { settingsRoutes } from './routes/settingsRoutes.js';
import { dashboardRoutes } from './routes/dashboardRoutes.js';
import { smsRoutes } from './routes/smsRoutes.js';
import { reportsRoutes } from './routes/reportsRoutes.js';
import { exportRoutes } from './routes/exportRoutes.js';
import { auditRoutes } from './routes/auditRoutes.js';

// ── Build allowed origins list ─────────────────────────────────────
const allowedOrigins: (string | RegExp)[] = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  // Pinggy tunnels use *.pinggy.io or *.pinggy-free.link pattern
  /^https:\/\/[a-z0-9.-]+\.(pinggy\.io|pinggy-free\.link)$/,
  // Cloudflare tunnels use *.trycloudflare.com pattern
  /^https:\/\/[a-z0-9.-]+\.trycloudflare\.com$/,
];

if (env.ALLOWED_ORIGINS) {
  env.ALLOWED_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean)
    .forEach((o) => allowedOrigins.push(o));
}

// ── Server ────────────────────────────────────────────────────────
const fastify = Fastify({
  logger:
    env.NODE_ENV === 'development'
      ? { level: 'info', transport: { target: 'pino-pretty' } }
      : { level: 'warn' },
  // Security: strip internal server error details from client responses
  disableRequestLogging: false,
  trustProxy: true, // Needed behind Nginx / Pinggy reverse-proxy for real IP
  ajv: {
    customOptions: {
      strict: false,
    },
  },
});

// ── Swagger (must register BEFORE routes for schema collection) ────
if (env.SWAGGER_ENABLED) {
  await registerSwagger(fastify, env.SWAGGER_API_KEY);
}

// ── Security Headers ──────────────────────────────────────────────
await fastify.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net'],
      imgSrc: ["'self'", 'data:', 'cdn.jsdelivr.net'],
    },
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  crossOriginEmbedderPolicy: false, // Required for Swagger UI
});

// ── CORS ──────────────────────────────────────────────────────────
await fastify.register(cors, {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // Same-origin / curl / Postman
    const allowed = allowedOrigins.some((o) =>
      o instanceof RegExp ? o.test(origin) : o === origin
    );
    if (allowed) return cb(null, true);
    return cb(new Error(`CORS: Origin "${origin}" not allowed`), false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-ID'],
  credentials: true,
  maxAge: 86400,
});

// ── Response Compression ──────────────────────────────────────────
await fastify.register(compress, {
  // Only compress response payloads larger than 1KB (1024 bytes)
  threshold: 1024,
});

// ── Global Rate Limiting ──────────────────────────────────────────
await fastify.register(rateLimit, {
  global: true,
  max: 100,
  timeWindow: '1 minute',
  redis,
  keyGenerator: (req) => req.ip ?? 'unknown',
  errorResponseBuilder: (_req, context) => ({
    success: false,
    error: `Rate limit exceeded. Retry after ${context.after}.`,
    retryAfter: context.after,
  }),
});

// ── JWT Plugin ────────────────────────────────────────────────────
// Using @fastify/jwt v10 which pins to a patched fast-jwt resolving:
//   - GHSA-hm7r-c7qw-ghp6  (unknown crit header extensions)
//   - GHSA-mvf2-f6gm-w987  (algo confusion via whitespace RSA key)
//   - GHSA-rp9m-7r4c-75qg  (cache confusion / identity mixup)
//   - GHSA-cjw9-ghj4-fwxf  (ReDoS in allowed* claim validation)
//   - GHSA-gmvf-9v4p-v8jc  (empty HMAC secret bypass)
await fastify.register(jwt, {
  secret: env.JWT_SECRET,
  sign: { algorithm: 'HS256' },   // Explicit algo — prevents algo-confusion attacks
  verify: { algorithms: ['HS256'] }, // Allowlist only; rejects RS256, none, etc.
  messages: {
    badRequestErrorMessage: 'Authorization header format: Bearer <token>',
    noAuthorizationInHeaderMessage: 'Authorization header is missing.',
    authorizationTokenExpiredMessage: 'Session expired. Please log in again.',
    authorizationTokenInvalid: 'Token is invalid or tampered.',
  },
});

// ── Route Modules ─────────────────────────────────────────────────
await fastify.register(authRoutes,      { prefix: '/api/auth' });
await fastify.register(loanRoutes,      { prefix: '/api/loans' });
await fastify.register(paymentRoutes,   { prefix: '/api/payments' });
await fastify.register(verifyRoutes,    { prefix: '/api/verify' });
await fastify.register(settingsRoutes,  { prefix: '/api/settings' });
await fastify.register(dashboardRoutes, { prefix: '/api/dashboard' });
await fastify.register(smsRoutes,       { prefix: '/api/sms' });
await fastify.register(reportsRoutes,   { prefix: '/api/reports' });
await fastify.register(exportRoutes,    { prefix: '/api/export' });
await fastify.register(auditRoutes,     { prefix: '/api/audit-logs' });

// ── Health Check (public) ─────────────────────────────────────────
fastify.get('/', async (_req, reply) => reply.redirect('/api/health'));

fastify.get(
  '/api/health',
  {
    schema: {
      tags: ['System'],
      summary: 'Service health check',
      description: 'Returns liveness and readiness status for PostgreSQL and Redis.',
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['ok', 'degraded'] },
            timestamp: { type: 'string', format: 'date-time' },
            services: {
              type: 'object',
              properties: {
                db: { type: 'string' },
                redis: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
  async (_req, reply) => {
    let dbOk = false;
    let redisOk = false;

    try { await prisma.$queryRaw`SELECT 1`; dbOk = true; } catch { dbOk = false; }
    try { await redis.ping(); redisOk = true; } catch { redisOk = false; }

    const healthy = dbOk && redisOk;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (reply as any).status(healthy ? 200 : 503).send({
      status: healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: { db: dbOk ? 'ok' : 'error', redis: redisOk ? 'ok' : 'error' },
    });
  }
);

// ── Global Error Handler ──────────────────────────────────────────
fastify.setErrorHandler((error: FastifyError, request, reply) => {
  fastify.log.error({ err: error, reqId: request.id }, 'Unhandled error');

  // Never leak stack traces or internal details to clients
  if (error.validation) {
    return reply.status(400).send({
      success: false,
      error: 'Request validation failed.',
      details: error.validation,
    });
  }

  if (error.statusCode === 429) {
    return reply.status(429).send({ success: false, error: error.message });
  }

  if (error.statusCode && error.statusCode < 500) {
    return reply.status(error.statusCode as 400 | 401 | 403 | 404 | 409 | 422).send({ success: false, error: error.message });
  }

  // 5xx — generic message only; details are in server logs
  return reply.status(500).send({
    success: false,
    error: 'Internal Server Error. Please contact support.',
  });
});

// ── 404 Handler ───────────────────────────────────────────────────
fastify.setNotFoundHandler((_request, reply) => {
  return reply.status(404).send({ success: false, error: 'Route not found.' });
});

// ── Boot ──────────────────────────────────────────────────────────
const start = async () => {
  try {
    await redis.connect();

    const address = await fastify.listen({ port: env.PORT, host: '0.0.0.0' });

    console.log(`\n🚀 LoanTracker Pro backend → ${address}`);
    console.log(`📋 Health:   ${address}/api/health`);
    if (env.SWAGGER_ENABLED) {
      console.log(`📖 Swagger:  ${address}/docs`);
      console.log(`🔑 API Key:  ${env.SWAGGER_API_KEY}`);
    }
    console.log(`🌍 Env: ${env.NODE_ENV}\n`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// ── Graceful Shutdown ─────────────────────────────────────────────
const shutdown = async (signal: string) => {
  console.log(`\n⚠️  ${signal} — shutting down gracefully...`);
  await fastify.close();
  await prisma.$disconnect();
  redis.disconnect();
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught exception:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('💥 Unhandled rejection:', reason);
  process.exit(1);
});

start();
