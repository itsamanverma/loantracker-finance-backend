import { FastifyReply, FastifyRequest } from 'fastify';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { redis } from '../config/redis.js';

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken is required'),
});

export class AuthController {
  static async login(request: FastifyRequest, reply: FastifyReply) {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.errors[0].message });
    }

    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return reply.status(401).send({ success: false, error: 'Invalid email or password' });
    }

    if (!user.isActive) {
      return reply.status(403).send({ success: false, error: 'Account deactivated. Please contact support.' });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return reply.status(401).send({ success: false, error: 'Invalid email or password' });
    }

    // Sign access token (15 min) and refresh token (7 days)
    const accessToken = request.server.jwt.sign(
      { id: user.id, email: user.email, accessType: user.accessType },
      { expiresIn: '15m' }
    );

    const refreshToken = request.server.jwt.sign(
      { id: user.id },
      { expiresIn: '7d' }
    );

    // Persist refresh token in Redis (TTL: 7 days)
    await redis.set(`session:${user.id}`, refreshToken, 'EX', 7 * 24 * 60 * 60);

    // Update login stats
    await prisma.user.update({
      where: { id: user.id },
      data: {
        loginCount: { increment: 1 },
        lastLogin: new Date(),
      },
    });

    return reply.send({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.fullName,
        access_type: user.accessType,
        department: user.department,
        permissions: user.permissions,
      },
    });
  }

  static async refresh(request: FastifyRequest, reply: FastifyReply) {
    const parsed = refreshSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: 'refreshToken is required' });
    }

    const { refreshToken } = parsed.data;

    let decoded: { id: number };
    try {
      decoded = request.server.jwt.verify(refreshToken) as { id: number };
    } catch {
      return reply.status(401).send({ success: false, error: 'Invalid or expired refresh token' });
    }

    // Validate that the refresh token matches what's stored in Redis
    const storedToken = await redis.get(`session:${decoded.id}`);
    if (!storedToken || storedToken !== refreshToken) {
      return reply.status(401).send({ success: false, error: 'Refresh token has been invalidated' });
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, email: true, accessType: true, isActive: true },
    });

    if (!user || !user.isActive) {
      return reply.status(401).send({ success: false, error: 'User not found or deactivated' });
    }

    // Rotate tokens
    const newAccessToken = request.server.jwt.sign(
      { id: user.id, email: user.email, accessType: user.accessType },
      { expiresIn: '15m' }
    );
    const newRefreshToken = request.server.jwt.sign(
      { id: user.id },
      { expiresIn: '7d' }
    );

    await redis.set(`session:${user.id}`, newRefreshToken, 'EX', 7 * 24 * 60 * 60);

    return reply.send({ accessToken: newAccessToken, refreshToken: newRefreshToken });
  }

  static async logout(request: FastifyRequest, reply: FastifyReply) {
    const user = request.currentUser!;
    await redis.del(`session:${user.id}`);
    return reply.send({ success: true });
  }

  static async me(request: FastifyRequest, reply: FastifyReply) {
    const user = request.currentUser!;

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        fullName: true,
        mobileNo: true,
        accessType: true,
        department: true,
        permissions: true,
        isActive: true,
        loginCount: true,
        lastLogin: true,
        createdAt: true,
      },
    });

    if (!dbUser) {
      return reply.status(404).send({ success: false, error: 'User not found' });
    }

    return reply.send({ success: true, data: dbUser });
  }

  static async updateMe(request: FastifyRequest, reply: FastifyReply) {
    const user = request.currentUser!;
    const schema = z.object({
      fullName: z.string().min(2).optional(),
      mobileNo: z.string().optional(),
      department: z.string().optional(),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.errors[0].message });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: parsed.data,
      select: { id: true, email: true, fullName: true, mobileNo: true, department: true },
    });

    return reply.send({ success: true, data: updated });
  }
}
