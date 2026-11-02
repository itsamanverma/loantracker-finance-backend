# Tech API Reference

Date: 2026-05-27

## Scope
Technical API list required by frontend for production backend integration.

## Backend Tech Stack
- Runtime: Node.js 20+
- Language: TypeScript (strict mode)
- Framework: Fastify 4.x
- ORM: Prisma 5.x
- Database: PostgreSQL 15+
- Cache and session store: Redis (ioredis)
- Auth: JWT access/refresh tokens via @fastify/jwt
- Password hashing: bcrypt
- Validation: zod
- Security middleware: @fastify/helmet, @fastify/cors, @fastify/rate-limit
- External services: AWS SNS (OTP SMS), WhatsApp Business API (fallback verification)
- Process and deployment: Docker + Nginx reverse proxy (recommended)
- Observability: structured app logs + audit_logs table for sensitive actions

## Base
- Base URL: /api
- Content-Type: application/json
- Auth header (protected routes): Authorization: Bearer <accessToken>

## Auth
1. POST /api/auth/login
- Public
- Body: { email, password }
- Returns: { accessToken, refreshToken, user }

2. POST /api/auth/refresh
- Public (refresh token validated)
- Body: { refreshToken }
- Returns: rotated tokens

3. POST /api/auth/logout
- Authenticated
- Invalidates active session

## Dashboard
1. GET /api/dashboard/stats
- Authenticated
- Returns KPI/cards/chart data

## Loans
1. GET /api/loans
- Permission: manage_loans
- Query: page, limit, search, status, sortField, sortDir

2. GET /api/loans/:id
- Permission: manage_loans

3. POST /api/loans
- Permission: manage_loans
- Body: { customerName, customerMobile, amount, durationMonths, verificationToken, customInterestRate? }

4. PATCH /api/loans/:id/status
- Permission: manage_loans
- Body: { status }

## Payments
1. GET /api/payments
- Permission: manage_payments
- Query: page, limit, search, status, loanId

2. POST /api/payments
- Permission: manage_payments
- Body: { loan_id, amount, paid_date }

## Verification
1. POST /api/verify/send-otp
- Permission: manage_loans
- Body: { mobile }

2. POST /api/verify/verify-otp
- Permission: manage_loans
- Body: { mobile, otp }
- Returns: { verified, verificationToken }

3. POST /api/verify/send-whatsapp
- Permission: manage_loans
- Body: { mobile }

## Reports and Messaging
1. GET /api/reports/delinquencies
- Permission: view_reports

2. POST /api/sms/send
- Permission: manage_loans
- Body: { loanId, mobile, message }

3. POST /api/sms/broadcast
- Permission: manage_loans
- Body: { loanIds, template }

## Export
1. GET /api/export/loans
- Permission: export_data
- Query: startDate, endDate, status, format=csv|json
- Headers: Accept: text/csv or application/json

## Settings
1. GET /api/settings/interest-rates
- Permission: system_config

2. PUT /api/settings/interest-rates
- Permission: system_config
- Body: { durationMonths, interestRate }

3. GET /api/settings/users
- Permission: SUPER_ADMIN

4. POST /api/settings/users
- Permission: SUPER_ADMIN
- Body: { email, fullName, mobileNo, accessType, department, permissions }

5. PATCH /api/settings/users/:id
- Permission: SUPER_ADMIN

6. PATCH /api/settings/users/:id/status
- Permission: SUPER_ADMIN
- Body: { isActive }

## Audit and Profile
1. GET /api/audit-logs
- Permission: audit_logs

2. GET /api/auth/me (recommended)
- Authenticated

3. PATCH /api/auth/me (recommended)
- Authenticated

## Security Requirements
1. HTTPS only, strict CORS allow-list, security headers.
2. JWT access (15m) + refresh (7d) with rotation.
3. Enforce RBAC in backend on every protected endpoint.
4. Input validation for all payloads (schema-based).
5. Rate limiting for login, OTP, verify, SMS endpoints.
6. Payment idempotency to prevent duplicate posts.
7. Password hashing with bcrypt.
8. Audit logging for config/payment/user/export actions.
9. Do not log secrets, OTPs, or raw tokens.

## Important Alignment
Use a single OTP verification path everywhere. Preferred:
- /api/verify/verify-otp

(There is inconsistency in existing docs between verify-otp and check-otp.)
