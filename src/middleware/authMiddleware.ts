import { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';
import { DecodedToken } from '../types/index.js';

// ─── API Key Guard ────────────────────────────────────────────────────────────
/**
 * Validates X-API-Key header against the SWAGGER_API_KEY env var.
 * Used as an additional layer for Swagger UI access in production.
 */
export const validateApiKey = async (request: FastifyRequest, reply: FastifyReply) => {
  const apiKey = request.headers['x-api-key'];
  if (!apiKey || apiKey !== env.SWAGGER_API_KEY) {
    return reply.status(401).send({ success: false, error: 'Invalid or missing API key.' });
  }
};

// ─── JWT Authentication ───────────────────────────────────────────────────────
/**
 * Verify JWT access token and check if the user account is still active.
 * Attaches decoded user + live permissions to request.currentUser.
 *
 * Security hardening:
 *  - Uses request.jwtVerify() which enforces algorithm matching
 *  - Re-validates isActive from DB on every request (not just token)
 *  - Does NOT rely on permission claims in the JWT payload (anti-privilege-escalation)
 */
export const authenticateUser = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    await request.jwtVerify();
  } catch {
    return reply.status(401).send({ success: false, error: 'Invalid or expired session token.' });
  }

  const decoded = request.user as DecodedToken;

  // Always load fresh permissions from DB — never trust stale JWT claims
  const dbUser = await prisma.user.findUnique({
    where: { id: decoded.id },
    select: { isActive: true, permissions: true, accessType: true },
  });

  if (!dbUser) {
    return reply.status(401).send({ success: false, error: 'User account not found.' });
  }

  if (!dbUser.isActive) {
    return reply.status(403).send({ success: false, error: 'This account has been deactivated.' });
  }

  request.currentUser = {
    id: decoded.id,
    email: decoded.email,
    accessType: dbUser.accessType,
    permissions: dbUser.permissions,
  };
};

// ─── Permission Guards ────────────────────────────────────────────────────────
/**
 * Require a specific named permission on the authenticated user.
 * SUPER_ADMIN bypasses all permission checks.
 */
export const requirePermission = (permission: string) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.currentUser;
    if (!user) {
      return reply.status(401).send({ success: false, error: 'Unauthorized.' });
    }
    if (user.accessType === 'SUPER_ADMIN') return; // full bypass
    if (!user.permissions.includes(permission)) {
      return reply.status(403).send({
        success: false,
        error: `Forbidden. Missing required privilege: ${permission}`,
      });
    }
  };
};

/**
 * Require SUPER_ADMIN role specifically.
 */
export const requireSuperAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
  const user = request.currentUser;
  if (!user || user.accessType !== 'SUPER_ADMIN') {
    return reply.status(403).send({
      success: false,
      error: 'Forbidden. SUPER_ADMIN access required.',
    });
  }
};
