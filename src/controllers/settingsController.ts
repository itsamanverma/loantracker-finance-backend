import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../config/prisma.js';
import { redis } from '../config/redis.js';
import { auditService } from '../services/auditService.js';

const updateInterestRateSchema = z.object({
  durationMonths: z.coerce.number().refine((v) => [2, 3, 6, 12].includes(v)),
  interestRate: z.coerce.number().min(0.1).max(100),
});

const createUserSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(2),
  mobileNo: z.string().regex(/^\d{10}$/),
  accessType: z.enum(['ADMIN', 'SUB_ADMIN']),
  department: z.string().default('Operations'),
  permissions: z.array(z.string()).default([]),
  tempPassword: z.string().min(8).optional(),
});

const updateUserSchema = z.object({
  fullName: z.string().min(2).optional(),
  mobileNo: z.string().regex(/^\d{10}$/).optional(),
  department: z.string().optional(),
  permissions: z.array(z.string()).optional(),
});

const toggleStatusSchema = z.object({
  isActive: z.boolean(),
});

export class SettingsController {
  // ─── Interest Rates ──────────────────────────────────────────────

  static async getInterestRates(request: FastifyRequest, reply: FastifyReply) {
    const rates = await prisma.interestRate.findMany({
      orderBy: { durationMonths: 'asc' },
    });
    return reply.send({ success: true, data: rates });
  }

  static async updateInterestRate(request: FastifyRequest, reply: FastifyReply) {
    const parsed = updateInterestRateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.errors[0].message });
    }

    const { durationMonths, interestRate } = parsed.data;

    const updated = await prisma.interestRate.upsert({
      where: { durationMonths },
      update: { interestRate: new Decimal(interestRate) },
      create: { durationMonths, interestRate: new Decimal(interestRate) },
    });

    const currentUser = request.currentUser!;
    await auditService.log({
      userId: currentUser.id,
      action: 'UPDATE_INTEREST_RATES',
      entityType: 'config',
      details: { durationMonths, interestRate },
      ipAddress: request.ip,
    });

    return reply.send({ success: true, data: updated });
  }

  // ─── User Management ─────────────────────────────────────────────

  static async listUsers(request: FastifyRequest, reply: FastifyReply) {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
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
    return reply.send({ success: true, data: users });
  }

  static async createUser(request: FastifyRequest, reply: FastifyReply) {
    const parsed = createUserSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.errors[0].message });
    }

    const { email, fullName, mobileNo, accessType, department, permissions, tempPassword } =
      parsed.data;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return reply.status(400).send({ success: false, error: 'A user with this email already exists.' });
    }

    const rawPassword = tempPassword || 'Admin@123';
    const passwordHash = await bcrypt.hash(rawPassword, 12);

    const newUser = await prisma.user.create({
      data: { email, passwordHash, fullName, mobileNo, accessType, department, permissions },
      select: {
        id: true,
        email: true,
        fullName: true,
        accessType: true,
        department: true,
        permissions: true,
        isActive: true,
        createdAt: true,
      },
    });

    const currentUser = request.currentUser!;
    await auditService.log({
      userId: currentUser.id,
      action: 'CREATE_USER',
      entityType: 'user',
      entityId: newUser.id,
      details: { email, accessType, permissions },
      ipAddress: request.ip,
    });

    return reply.status(201).send({ success: true, data: newUser });
  }

  static async updateUser(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const userId = parseInt(id);

    const parsed = updateUserSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: parsed.error.errors[0].message });
    }

    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      return reply.status(404).send({ success: false, error: 'User not found' });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: parsed.data,
      select: {
        id: true,
        email: true,
        fullName: true,
        accessType: true,
        department: true,
        permissions: true,
        isActive: true,
      },
    });

    const currentUser = request.currentUser!;
    await auditService.log({
      userId: currentUser.id,
      action: 'UPDATE_USER',
      entityType: 'user',
      entityId: userId,
      details: parsed.data,
      ipAddress: request.ip,
    });

    return reply.send({ success: true, data: updated });
  }

  static async toggleUserStatus(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    const userId = parseInt(id);

    const parsed = toggleStatusSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: 'isActive (boolean) is required' });
    }

    const { isActive } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      return reply.status(404).send({ success: false, error: 'User not found' });
    }

    await prisma.user.update({ where: { id: userId }, data: { isActive } });

    // Force-logout if deactivating: delete session from Redis
    if (!isActive) {
      await redis.del(`session:${userId}`);
    }

    const currentUser = request.currentUser!;
    await auditService.log({
      userId: currentUser.id,
      action: isActive ? 'UPDATE_USER' : 'DEACTIVATE_USER',
      entityType: 'user',
      entityId: userId,
      details: { isActive },
      ipAddress: request.ip,
    });

    return reply.send({
      success: true,
      message: isActive ? 'User account activated.' : 'User account deactivated.',
    });
  }
}
