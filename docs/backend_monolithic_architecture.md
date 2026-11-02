# 🏗️ BACKEND MONOLITHIC ARCHITECTURE & SETUP BLUEPRINT

**Version:** 2.1  
**Date:** May 2026  
**Status:** Monolithic Server Production Reference Blueprint

This document details the architectural blueprints, codebase file structure, configuration presets, and production-ready source code templates required to build and deploy the Node.js + Fastify + Prisma + PostgreSQL + Redis monolithic backend for **LoanTracker Pro**.

---

## 📂 1. Directory Structure

This monolithic directory contains everything required for routing, controller orchestration, ORM schema declarations, security middleware, external service utilities (SMS/WhatsApp), and DB migration configurations.

```
loan-tracking-backend/
├── prisma/
│   ├── migrations/
│   └── schema.prisma
├── src/
│   ├── config/
│   │   ├── env.ts
│   │   ├── prisma.ts
│   │   └── redis.ts
│   ├── controllers/
│   │   ├── authController.ts
│   │   ├── loanController.ts
│   │   ├── paymentController.ts
│   │   ├── verifyController.ts
│   │   └── settingsController.ts
│   ├── middleware/
│   │   ├── authMiddleware.ts
│   │   └── rateLimiter.ts
│   ├── routes/
│   │   ├── authRoutes.ts
│   │   ├── loanRoutes.ts
│   │   ├── paymentRoutes.ts
│   │   ├── verifyRoutes.ts
│   │   └── settingsRoutes.ts
│   ├── services/
│   │   ├── smsService.ts
│   │   ├── whatsappService.ts
│   │   └── auditService.ts
│   ├── types/
│   │   └── index.d.ts
│   └── index.ts
├── .env
├── package.json
└── tsconfig.json
```

---

## 🛠️ 2. Core Project Configuration Files

### `package.json`
Define the backend project dependencies, scripts for database migration, dev servers, and build setups.

```json
{
  "name": "loantracker-pro-backend",
  "version": "1.0.0",
  "description": "Monolithic backend for LoanTracker Pro using Fastify, Prisma, PostgreSQL and Redis",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:studio": "prisma studio",
    "prisma:seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "@fastify/cors": "^10.0.1",
    "@fastify/helmet": "^12.0.1",
    "@fastify/jwt": "^9.0.1",
    "@fastify/rate-limit": "^10.2.2",
    "@prisma/client": "^5.14.0",
    "bcrypt": "^5.1.1",
    "dotenv": "^16.4.5",
    "fastify": "^4.27.0",
    "ioredis": "^5.4.1",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/bcrypt": "^5.0.2",
    "@types/node": "^20.12.12",
    "prisma": "^5.14.0",
    "tsx": "^4.10.5",
    "typescript": "^5.4.5"
  }
}
```

### `tsconfig.json`
Strict compiler configs for standard Node + TypeScript execution.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*"]
}
```

---

## 🗄️ 3. Database ORM Declaration (`prisma/schema.prisma`)

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

enum AccessType {
  SUPER_ADMIN
  ADMIN
  SUB_ADMIN
}

enum LoanStatus {
  PENDING
  ACTIVE
  CLOSED
  DEFAULT
}

enum PaymentStatus {
  PENDING
  PAID
  OVERDUE
}

enum LogActionType {
  CREATE_USER
  UPDATE_USER
  DEACTIVATE_USER
  CREATE_LOAN
  UPDATE_LOAN_STATUS
  RECORD_PAYMENT
  UPDATE_INTEREST_RATES
  EXPORT_DATA
  SMS_BROADCAST
}

model User {
  id                 Int         @id @default(autoincrement())
  email              String      @unique
  passwordHash       String
  fullName           String
  mobileNo           String
  accessType         AccessType  @default(SUB_ADMIN)
  department         String      @default("Operations")
  permissions        String[]    @default([])
  isActive           Boolean     @default(true)
  loginCount         Int         @default(0)
  lastLogin          DateTime?
  twoFactorEnabled   Boolean     @default(false)
  createdAt          DateTime    @default(now())
  updatedAt          DateTime    @updatedAt
  loans              Loan[]
  auditLogs          AuditLog[]

  @@map("users")
}

model Loan {
  id                 Int         @id @default(autoincrement())
  userId             Int?
  user               User?       @relation(fields: [userId], references: [id], onDelete: SetNull)
  customerName       String
  customerMobile     String
  mobileVerified     Boolean     @default(false)
  verificationToken  String?
  amount             Decimal     @db.Decimal(12, 2)
  durationMonths     Int
  interestRate       Decimal     @db.Decimal(5, 2)
  emiAmount          Decimal     @db.Decimal(12, 2)
  totalAmount        Decimal     @db.Decimal(12, 2)
  startDate          DateTime    @db.Date
  endDate            DateTime    @db.Date
  status             LoanStatus  @default(PENDING)
  createdAt          DateTime    @default(now())
  updatedAt          DateTime    @updatedAt
  payments           Payment[]
  smsLogs            SmsLog[]

  @@index([status])
  @@index([customerMobile])
  @@map("loans")
}

model Payment {
  id                 Int           @id @default(autoincrement())
  loanId             Int
  loan               Loan          @relation(fields: [loanId], references: [id], onDelete: Cascade)
  installment        Int
  dueDate            DateTime      @db.Date
  amount             Decimal       @db.Decimal(12, 2)
  paidDate           DateTime?     @db.Date
  status             PaymentStatus @default(PENDING)
  createdAt          DateTime      @default(now())
  updatedAt          DateTime      @updatedAt

  @@unique([loanId, installment])
  @@index([status])
  @@index([dueDate])
  @@map("payments")
}

model SmsLog {
  id                 Int         @id @default(autoincrement())
  loanId             Int?
  loan               Loan?       @relation(fields: [loanId], references: [id], onDelete: Cascade)
  customerMobile     String
  messageContent     String
  status             String      // "SENT" | "FAILED"
  sentAt             DateTime    @default(now())

  @@map("sms_logs")
}

model InterestRate {
  id                 Int         @id @default(autoincrement())
  durationMonths     Int         @unique
  interestRate       Decimal     @db.Decimal(5, 2)
  isActive           Boolean     @default(true)
  createdAt          DateTime    @default(now())
  updatedAt          DateTime    @updatedAt

  @@map("interest_rates")
}

model AuditLog {
  id                 Int         @id @default(autoincrement())
  userId             Int?
  user               User?       @relation(fields: [userId], references: [id], onDelete: SetNull)
  action             String
  entityType         String      // "loan" | "payment" | "user" | "config"
  entityId           Int?
  details            Json?
  ipAddress          String?
  createdAt          DateTime    @default(now())

  @@map("audit_logs")
}
```

---

## 🚀 4. Source Code Boilerplate Files

### `src/config/env.ts`
Validate the presence of required environment keys at startup using Zod.

```typescript
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  AWS_REGION: z.string().default('ap-south-1'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_SNS_SENDER_ID: z.string().default('LNTRACK'),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
});

export const env = envSchema.parse(process.env);
```

### `src/config/prisma.ts`
Single db instance pool for Prisma Queries.

```typescript
import { PrismaClient } from '@prisma/client';
import { env } from './env.js';

export const prisma = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});
```

### `src/config/redis.ts`
Core connection handler to the Redis cache.

```typescript
import { Redis } from 'ioredis';
import { env } from './env.js';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
});

redis.on('connect', () => console.log('⚡ Redis connection active'));
redis.on('error', (err) => console.error('❌ Redis connection error:', err));
```

### `src/index.ts`
The server entrypoint using Fastify to load CORS, Helmet, rate-limiters, plugins, JWT, routes, and error handling.

```typescript
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';

import { env } from './config/env.js';
import { redis } from './config/redis.js';
import { authRoutes } from './routes/authRoutes.js';
import { loanRoutes } from './routes/loanRoutes.js';
import { paymentRoutes } from './routes/paymentRoutes.js';
import { verifyRoutes } from './routes/verifyRoutes.js';
import { settingsRoutes } from './routes/settingsRoutes.js';

const fastify = Fastify({
  logger: env.NODE_ENV === 'development',
});

// Security & Network Configuration
await fastify.register(helmet, { contentSecurityPolicy: false });
await fastify.register(cors, { origin: true });

// Rate Limiter
await fastify.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
  redis: redis,
});

// JWT Authorization Plugin
await fastify.register(jwt, {
  secret: env.JWT_SECRET,
  messages: {
    badRequestErrorMessage: 'Authorization header format is: Bearer <token>',
    noAuthorizationInHeaderMessage: 'Authorization header is missing.',
    authorizationTokenExpiredMessage: 'Session expired. Please authenticate again.',
  }
});

// Register Endpoint Route Modules
await fastify.register(authRoutes, { prefix: '/api/auth' });
await fastify.register(loanRoutes, { prefix: '/api/loans' });
await fastify.register(paymentRoutes, { prefix: '/api/payments' });
await fastify.register(verifyRoutes, { prefix: '/api/verify' });
await fastify.register(settingsRoutes, { prefix: '/api/settings' });

// Global Error Handler
fastify.setErrorHandler((error, request, reply) => {
  fastify.log.error(error);
  if (error.statusCode) {
    reply.status(error.statusCode).send({ error: error.message });
  } else {
    reply.status(500).send({ error: 'Internal Server Error. Please contact support.' });
  }
});

// Server Boot Trigger
const start = async () => {
  try {
    const address = await fastify.listen({ port: env.PORT, host: '0.0.0.0' });
    console.log(`🚀 LoanTracker Pro monolithic backend running at: ${address}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
```

---

### `src/middleware/authMiddleware.ts`
Enforce authentication, verify JWT scopes, check user status, and validate permissions.

```typescript
import { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../config/prisma.js';

export interface DecodedToken {
  id: number;
  email: string;
  accessType: 'SUPER_ADMIN' | 'ADMIN' | 'SUB_ADMIN';
}

export const authenticateUser = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    await request.jwtVerify();
    const decoded = request.user as DecodedToken;

    // Check if account is deactivated in database
    const dbUser = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { isActive: true, permissions: true }
    });

    if (!dbUser) {
      return reply.status(401).send({ error: 'User account not found' });
    }

    if (!dbUser.isActive) {
      return reply.status(403).send({ error: 'This user account has been deactivated.' });
    }

    // Attach profile/permissions metadata to request context
    request.headers['x-user-permissions'] = dbUser.permissions.join(',');
  } catch (err) {
    return reply.status(401).send({ error: 'Invalid or expired session token.' });
  }
};

export const requirePermission = (permission: string) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const decoded = request.user as DecodedToken;
    
    // Super Admins override all checks
    if (decoded.accessType === 'SUPER_ADMIN') {
      return;
    }

    const permissionsHeader = request.headers['x-user-permissions'] as string || '';
    const userPermissions = permissionsHeader.split(',');

    if (!userPermissions.includes(permission)) {
      return reply.status(403).send({ error: `Forbidden. Missing required privilege: ${permission}` });
    }
  };
};
```

---

### `src/controllers/authController.ts`
Executes user login check, checks activity, and manages token updates.

```typescript
import { FastifyReply, FastifyRequest } from 'fastify';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { redis } from '../config/redis.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export class AuthController {
  static async login(request: FastifyRequest, reply: FastifyReply) {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid credentials payload' });
    }

    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    if (!user.isActive) {
      return reply.status(403).send({ error: 'Account deactivated. Please contact support.' });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    // Generate JWT Access & Refresh tokens
    const accessToken = request.server.jwt.sign(
      { id: user.id, email: user.email, accessType: user.accessType },
      { expiresIn: '15m' }
    );

    const refreshToken = request.server.jwt.sign(
      { id: user.id },
      { expiresIn: '7d' }
    );

    // Save refresh session in Redis
    await redis.set(`session:${user.id}`, refreshToken, 'EX', 7 * 24 * 60 * 60);

    // Increment login statistics
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

  static async logout(request: FastifyRequest, reply: FastifyReply) {
    const user = request.user as { id: number };
    await redis.del(`session:${user.id}`);
    return reply.send({ success: true });
  }
}
```

---

### `src/routes/authRoutes.ts`
Auth module routing definitions.

```typescript
import { FastifyInstance } from 'fastify';
import { AuthController } from '../controllers/authController.js';
import { authenticateUser } from '../middleware/authMiddleware.js';

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/login', AuthController.login);
  fastify.post('/logout', { preHandler: [authenticateUser] }, AuthController.logout);
}
```

---

### `src/controllers/loanController.ts`
Handles loan listings, wizard creation checks, and validation tokens.

```typescript
import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { redis } from '../config/redis.js';

const createLoanSchema = z.object({
  customerName: z.string().min(2),
  customerMobile: z.string(),
  amount: z.coerce.number().positive(),
  durationMonths: z.enum([2, 3, 6, 12] as any).transform(v => Number(v)),
  verificationToken: z.string()
});

export class LoanController {
  static async list(request: FastifyRequest, reply: FastifyReply) {
    const { page = 1, limit = 10, search, status } = request.query as any;
    const pageNum = Number(page);
    const limitNum = Number(limit);

    const where: any = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { customerName: { contains: search, mode: 'insensitive' } },
        { customerMobile: { contains: search } }
      ];
    }

    const [loans, total] = await Promise.all([
      prisma.loan.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.loan.count({ where })
    ]);

    return reply.send({
      loans,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  }

  static async create(request: FastifyRequest, reply: FastifyReply) {
    const parsed = createLoanSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.message });
    }

    const { customerName, customerMobile, amount, durationMonths, verificationToken } = parsed.data;

    // Validate the mobile OTP token in Redis
    const cachedToken = await redis.get(`verified:${customerMobile}`);
    if (!cachedToken || cachedToken !== verificationToken) {
      return reply.status(400).send({ error: 'Customer mobile must be verified before creating a loan.' });
    }

    // Resolve rate parameters
    const rateConfig = await prisma.interestRate.findUnique({ where: { durationMonths } });
    if (!rateConfig) {
      return reply.status(400).send({ error: `Interest rate configuration missing for duration: ${durationMonths}` });
    }

    const interestRate = Number(rateConfig.interestRate);
    const totalAmount = amount * (1 + (interestRate / 100));
    const emiAmount = totalAmount / durationMonths;

    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(startDate.getMonth() + durationMonths);

    // Create loan and payment schedule transaction
    const loan = await prisma.$transaction(async (tx) => {
      const createdLoan = await tx.loan.create({
        data: {
          customerName,
          customerMobile,
          mobileVerified: true,
          verificationToken,
          amount,
          durationMonths,
          interestRate,
          emiAmount,
          totalAmount,
          startDate,
          endDate,
          status: 'PENDING',
        }
      });

      // Generate payment calendar schedule
      const installments = [];
      for (let i = 1; i <= durationMonths; i++) {
        const dueDate = new Date();
        dueDate.setMonth(startDate.getMonth() + i);
        installments.push({
          loanId: createdLoan.id,
          installment: i,
          dueDate,
          amount: emiAmount,
          status: 'PENDING'
        });
      }

      await tx.payment.createMany({ data: installments as any });
      return createdLoan;
    });

    // Cleanup OTP key in Redis
    await redis.del(`verified:${customerMobile}`);

    return reply.status(201).send({ success: true, loan });
  }
}
```

---

### `src/routes/loanRoutes.ts`
Loan routing declarations.

```typescript
import { FastifyInstance } from 'fastify';
import { LoanController } from '../controllers/loanController.js';
import { authenticateUser, requirePermission } from '../middleware/authMiddleware.js';

export async function loanRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authenticateUser);

  fastify.get('/', { preHandler: [requirePermission('manage_loans')] }, LoanController.list);
  fastify.post('/', { preHandler: [requirePermission('manage_loans')] }, LoanController.create);
}
```

---

## ⚙️ 5. Startup & Environment Setup Variables (`.env`)

Save this key template to `.env` file to initialize config variables.

```bash
PORT=3000
NODE_ENV=development

# Database URIs
DATABASE_URL="postgresql://loantracker_user:admin123@localhost:5432/loantracker_db?schema=public"
REDIS_URL="redis://127.0.0.1:6379/0"

# JWT Encryption Keys
JWT_SECRET="super-secure-long-32-byte-hexadecimal-secret-key"
JWT_REFRESH_SECRET="another-secure-long-32-byte-refresh-key-secret"

# AWS SNS / WhatsApp API Configuration
AWS_REGION="ap-south-1"
AWS_ACCESS_KEY_ID="AKIAIOSFODNN7EXAMPLE"
AWS_SECRET_ACCESS_KEY="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
AWS_SNS_SENDER_ID="LNTRACK"

# WhatsApp Business Integration
WHATSAPP_PHONE_NUMBER_ID="109284019284012"
WHATSAPP_ACCESS_TOKEN="EAAGm...access...token"
```

---

## 🚦 6. Backend Initialization Step-by-Step

Execute the following steps inside a terminal to start and run the monolithic backend project:

1. **Initialize Project and Node Dependencies**:
   ```bash
   mkdir loan-tracking-backend
   cd loan-tracking-backend
   npm init -y
   npm install @fastify/cors @fastify/helmet @fastify/jwt @fastify/rate-limit @prisma/client bcrypt dotenv fastify ioredis zod
   npm install -D @types/bcrypt @types/node prisma tsx typescript
   ```

2. **Configure TypeScript**:
   * Save the `tsconfig.json` template config in the root directory.

3. **Initialize Prisma**:
   ```bash
   npx prisma init
   ```
   * Replace the generated `prisma/schema.prisma` file with the schema definition code specified in Section 3 of this document.

4. **Initialize Database Tables & Run Migrations**:
   Make sure a local PostgreSQL instance is running on your system, matches the credentials in `.env`, and execute:
   ```bash
   npx prisma migrate dev --name init
   ```

5. **Start Dev Server**:
   Ensure Redis server is running locally (`redis-server`), and spin up the developer hot-reload environment:
   ```bash
   npm run dev
   ```
