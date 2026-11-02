# LoanTracker Pro — Monolithic Backend

> **Node.js 20+ · Fastify 4 · TypeScript · Prisma 5 · PostgreSQL 15 · Redis**

Production-ready monolithic REST API for managing loan lifecycles, payments, OTP verification, SMS broadcasting, and role-based administration.

---

## 📂 Project Structure

```
Loan-tracking-BE/
├── prisma/
│   ├── schema.prisma          # All DB models + enums
│   └── seed.ts                # Interest rates + seed users
├── src/
│   ├── config/
│   │   ├── env.ts             # Zod env validation
│   │   ├── prisma.ts          # Singleton Prisma client
│   │   └── redis.ts           # ioredis connection
│   ├── controllers/
│   │   ├── authController.ts       # Login, refresh, logout, profile
│   │   ├── loanController.ts       # CRUD + EMI calc + rate override
│   │   ├── paymentController.ts    # Record payments, auto-status
│   │   ├── verifyController.ts     # OTP send/verify + WhatsApp
│   │   ├── settingsController.ts   # Interest rates + user management
│   │   ├── dashboardController.ts  # KPI aggregation
│   │   ├── smsController.ts        # Single + bulk broadcast
│   │   ├── reportsController.ts    # Delinquency reports
│   │   ├── exportController.ts     # CSV/JSON export
│   │   └── auditController.ts      # Audit log viewer
│   ├── middleware/
│   │   └── authMiddleware.ts       # JWT verify + RBAC guards
│   ├── routes/
│   │   ├── authRoutes.ts
│   │   ├── loanRoutes.ts
│   │   ├── paymentRoutes.ts
│   │   ├── verifyRoutes.ts
│   │   ├── settingsRoutes.ts
│   │   ├── dashboardRoutes.ts
│   │   ├── smsRoutes.ts
│   │   ├── reportsRoutes.ts
│   │   ├── exportRoutes.ts
│   │   └── auditRoutes.ts
│   ├── services/
│   │   ├── auditService.ts         # Append-only audit log writer
│   │   ├── smsService.ts           # AWS SNS SMS (simulated in dev)
│   │   └── whatsappService.ts      # WhatsApp Cloud API
│   ├── types/
│   │   └── index.d.ts             # Global type augmentations
│   └── index.ts                   # Fastify server entrypoint
├── .env                           # Environment config (do not commit)
├── package.json
└── tsconfig.json
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- Docker (for PostgreSQL)
- Redis running locally or via Docker

### 1. Configure Environment

Edit `.env` with your real credentials:

```bash
DATABASE_URL="postgresql://loantracker_user:admin123@localhost:5433/loantracker_db?schema=public"
REDIS_URL="redis://127.0.0.1:6379/0"
JWT_SECRET="your-32-char-minimum-secret-here"
JWT_REFRESH_SECRET="another-32-char-minimum-secret"
```

### 2. Start PostgreSQL via Docker

Run this command to spin up the required PostgreSQL container:
```bash
docker run --name loan-pg-db -e POSTGRES_USER=loantracker_user -e POSTGRES_PASSWORD=admin123 -e POSTGRES_DB=loantracker_db -p 5433:5432 -d postgres:16-alpine
```

### 3. Run Migrations & Seed

```bash
npm run prisma:migrate   # Creates all tables
npm run prisma:seed      # Seeds interest rates + admin users
```

### 4. Start Dev Server

```bash
npm run dev
```

Server starts at **http://localhost:3000**

### Deploy with Docker

Build the production image:

```bash
docker build -t loantracker-backend .
```

Apply database migrations from a release runner with access to PostgreSQL before starting the new version:

```bash
npx prisma migrate deploy
```

Run the container with production values for `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, and `JWT_REFRESH_SECRET`:

```bash
docker run -d --name loantracker-backend \
  -p 3000:3000 \
  --env-file .env \
  loantracker-backend
```

The database and Redis must be reachable from the container. When they run in Docker, use their service or container names as the host in `DATABASE_URL` and `REDIS_URL`, not `localhost`. The image does not include environment files or secrets.

### Deploy to Render with Neon and Upstash

The root `render.yaml` configures a Singapore-region free Docker web service with `/api/health` as its health check. To deploy:

1. Push this repository to GitHub. Confirm `.env` and other environment files are ignored, and include `prisma/migrations/` in the push.
2. Create the Neon PostgreSQL database and Upstash Redis database in regions close to Singapore. Copy their connection URLs; Neon must use SSL and Upstash Redis uses a `rediss://` URL.
3. Before the first deploy, apply committed migrations to Neon from this project directory:

   ```bash
   DATABASE_URL='your-neon-connection-url' npx prisma migrate deploy
   ```

4. In Render, create a Blueprint from the GitHub repository. Set the prompted `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `SWAGGER_API_KEY` values in Render's environment settings. Generate distinct, random secrets for the JWT variables; do not commit them or put them in `render.yaml`.
5. After deployment, check `https://<your-service>.onrender.com/api/health`. A healthy response reports both `db` and `redis` as `ok`.

The production Docker image intentionally contains only runtime dependencies; run `prisma migrate deploy` from a local checkout with the Prisma CLI installed before each deploy that includes new migrations. Render's free service may spin down after inactivity, so the first request after a pause can take longer. A periodic external ping does not guarantee that a free instance will stay awake.

---

## 📡 API Endpoints

**Live API Base URL (via Cloudflare Tunnel):** `https://picks-complement-legitimate-muscle.trycloudflare.com`

| Module | Method | Path | Permission |
|--------|--------|------|------------|
| Auth | POST | `/api/auth/login` | Public |
| Auth | POST | `/api/auth/refresh` | Public |
| Auth | POST | `/api/auth/logout` | Authenticated |
| Auth | GET | `/api/auth/me` | Authenticated |
| Dashboard | GET | `/api/dashboard/stats` | Authenticated |
| Loans | GET | `/api/loans` | `manage_loans` |
| Loans | POST | `/api/loans` | `manage_loans` |
| Loans | GET | `/api/loans/:id` | `manage_loans` |
| Loans | PATCH | `/api/loans/:id/status` | `manage_loans` |
| Payments | GET | `/api/payments` | `manage_payments` |
| Payments | POST | `/api/payments` | `manage_payments` |
| Verify | POST | `/api/verify/send-otp` | `manage_loans` |
| Verify | POST | `/api/verify/verify-otp` | `manage_loans` |
| Verify | POST | `/api/verify/send-whatsapp` | `manage_loans` |
| SMS | POST | `/api/sms/send` | `manage_loans` |
| SMS | POST | `/api/sms/broadcast` | `manage_loans` |
| Reports | GET | `/api/reports/delinquencies` | `view_reports` |
| Export | GET | `/api/export/loans` | `export_data` |
| Settings | GET/PUT | `/api/settings/interest-rates` | `system_config` |
| Settings | GET/POST | `/api/settings/users` | SUPER_ADMIN |
| Settings | PATCH | `/api/settings/users/:id` | SUPER_ADMIN |
| Settings | PATCH | `/api/settings/users/:id/status` | SUPER_ADMIN |
| Audit | GET | `/api/audit-logs` | `audit_logs` |
| Health | GET | `/api/health` | Public |

### Example Response: `/api/health`
```json
{
  "status": "ok",
  "timestamp": "2026-05-28T11:25:04.391Z",
  "services": {
    "db": "ok",
    "redis": "ok"
  }
}
```

---

## 🔐 Seeded Credentials

| Role | Email | Password |
|------|-------|----------|
| SUPER_ADMIN | superadmin@loantracker.in | Admin@123 |
| ADMIN | admin@loantracker.in | Admin@123 |

---

## 🌐 AWS SNS (Production SMS)

Install the optional AWS SDK peer dependency:

```bash
npm install @aws-sdk/client-sns
```

Then set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in `.env`. In development, SMS is simulated via console logs.

---

## 🛠️ NPM Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Hot-reload dev server via tsx |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled production build |
| `npm run prisma:generate` | Regenerate Prisma client |
| `npm run prisma:migrate` | Run DB migrations |
| `npm run prisma:studio` | Open Prisma Studio UI |
| `npm run prisma:seed` | Seed database with defaults |
| `npm run tunnel` | Start Pinggy.io HTTPS tunnel for external API access |
| `npm run tunnel:port --port=4000` | Start Pinggy.io tunnel on custom port |
| `npm run tunnel:cf` | Start Cloudflare Tunnel (cloudflared) for random HTTPS URL |
| `npm run tunnel:cf:port --port=4000` | Start Cloudflare Tunnel on custom port |
