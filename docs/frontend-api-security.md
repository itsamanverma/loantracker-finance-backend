# Frontend API Requirements and Security

Version: 1.0  
Date: 2026-05-27

## Purpose
This document defines the backend APIs required by the current frontend so it can move from local mock storage to real server integration.

Current frontend state:
- Data is read/written from localStorage and mock helpers.
- Auth is simulated in browser state.
- OTP and WhatsApp are simulated client-side.

Target state:
- All business operations use REST APIs.
- JWT-based auth and RBAC enforced server-side.
- OTP, verification, and notifications handled by backend services.

## API Base and Common Conventions
- Base URL: /api
- Content type: application/json for request/response bodies unless file export.
- Time format: ISO-8601 (UTC) for timestamps, YYYY-MM-DD for date-only fields.
- Currency: INR values as number with 2 decimals in backend.

## Common Headers
Public endpoints:
- Content-Type: application/json
- Accept: application/json
- X-Request-Id: <uuid> (recommended)

Authenticated endpoints:
- Content-Type: application/json
- Accept: application/json
- Authorization: Bearer <accessToken>
- X-Request-Id: <uuid> (recommended)

Export endpoints:
- Authorization: Bearer <accessToken>
- Accept: text/csv or application/json

## Authentication and Session Model
- Access token: JWT, 15 minutes.
- Refresh token: opaque/JWT, 7 days, rotated on refresh.
- Session storage: refresh token bound to user session in Redis.
- Logout: invalidates session server-side.

Required auth endpoints:

### 1) Login
POST /api/auth/login

Request:
{
  "email": "admin@loantracking.com",
  "password": "admin123"
}

Headers:
- Content-Type: application/json

Auth:
- Public endpoint

Success response:
{
  "accessToken": "...",
  "refreshToken": "...",
  "user": {
    "id": 1,
    "email": "admin@loantracking.com",
    "full_name": "Priya Mehta",
    "access_type": "ADMIN",
    "department": "Operations",
    "permissions": ["manage_loans", "manage_payments", "export_data", "view_reports", "audit_logs"]
  }
}

### 2) Refresh token
POST /api/auth/refresh

Request:
{
  "refreshToken": "..."
}

Headers:
- Content-Type: application/json

Auth:
- Public endpoint but token-validated

### 3) Logout
POST /api/auth/logout

Headers:
- Authorization: Bearer <accessToken>

Auth:
- Authenticated

## Frontend Required APIs by Module

### A. Dashboard
Used by Dashboard page.

1. GET /api/dashboard/stats
- Query: optional dateRange, status filters
- Headers: Authorization required
- Auth/RBAC: any authenticated user
- Security: return only fields needed for KPIs and charts

Example response:
{
  "totalLoans": 142,
  "activeLoans": 87,
  "totalDisbursed": 4280000,
  "totalCollected": 2940000,
  "pendingPayments": 34,
  "overduePayments": 12,
  "monthlyCollections": [{ "month": "2026-05", "amount": 320000 }],
  "loansByStatus": [{ "status": "ACTIVE", "count": 87 }]
}

### B. Loans
Used by Loans page and loan detail modal.

1. GET /api/loans
- Query:
  - page, limit
  - search (name/mobile/loan id)
  - status (PENDING|ACTIVE|CLOSED|DEFAULT)
  - sortField, sortDir (recommended)
- Headers: Authorization required
- Auth/RBAC: manage_loans

2. GET /api/loans/:id
- Headers: Authorization required
- Auth/RBAC: manage_loans

3. POST /api/loans
- Headers: Authorization required, Content-Type: application/json
- Auth/RBAC: manage_loans
- Security: verification token required for customer mobile

Request:
{
  "customerName": "Priya Singh",
  "customerMobile": "9876543210",
  "amount": 500000,
  "durationMonths": 6,
  "verificationToken": "uuid-from-redis",
  "customInterestRate": 7.5
}

4. PATCH /api/loans/:id/status
- Headers: Authorization required
- Auth/RBAC: manage_loans

Request:
{
  "status": "DEFAULT"
}

### C. Payments
Used by Payments page, Dashboard details, Reports calculations.

1. GET /api/payments
- Query:
  - page, limit
  - search
  - status (PAID|PENDING|OVERDUE)
  - loanId (optional to get schedule for one loan)
- Headers: Authorization required
- Auth/RBAC: manage_payments

2. POST /api/payments
- Headers: Authorization required
- Auth/RBAC: manage_payments
- Security: transaction-safe update; prevent double-posting of same installment

Request:
{
  "loan_id": 42,
  "amount": 12500.00,
  "paid_date": "2026-05-27"
}

### D. Mobile Verification
Used by loan creation step 2.

1. POST /api/verify/send-otp
- Headers: Authorization required
- Auth/RBAC: manage_loans
- Security: rate-limit by mobile and IP, 30s cooldown

Request:
{
  "mobile": "9876543210"
}

2. POST /api/verify/verify-otp
- Headers: Authorization required
- Auth/RBAC: manage_loans
- Security: max attempts, expiry, replay protection

Request:
{
  "mobile": "9876543210",
  "otp": "123456"
}

Response:
{
  "verified": true,
  "verificationToken": "uuid-token"
}

3. POST /api/verify/send-whatsapp
- Headers: Authorization required
- Auth/RBAC: manage_loans
- Security: throttle and webhook signature validation on callback path

### E. Reports and Delinquency Actions
Used by Reports page.

1. GET /api/reports/delinquencies
- Query: page, limit, search, dateRange (recommended)
- Headers: Authorization required
- Auth/RBAC: view_reports

2. POST /api/sms/send
- Headers: Authorization required
- Auth/RBAC: manage_loans

Request:
{
  "loanId": 42,
  "mobile": "9876543210",
  "message": "Dear Priya, your payment is overdue..."
}

3. POST /api/sms/broadcast
- Headers: Authorization required
- Auth/RBAC: manage_loans

Request:
{
  "loanIds": [42, 58, 71],
  "template": "Dear {name}, your payment of {amount} is overdue by {days} days."
}

### F. Export
Used by Export page.

1. GET /api/export/loans
- Query: startDate, endDate, status, format=csv|json
- Headers: Authorization required, Accept based on format
- Auth/RBAC: export_data
- Security: stream responses for large exports, log export activity

### G. Settings (Super Admin and Config)
Used by Settings page.

1. GET /api/settings/interest-rates
- Headers: Authorization required
- Auth/RBAC: system_config

2. PUT /api/settings/interest-rates
- Headers: Authorization required
- Auth/RBAC: system_config

Request:
{
  "durationMonths": 6,
  "interestRate": 10.0
}

3. GET /api/settings/users
- Headers: Authorization required
- Auth/RBAC: SUPER_ADMIN

4. POST /api/settings/users
- Headers: Authorization required
- Auth/RBAC: SUPER_ADMIN

Request:
{
  "email": "new.user@loantracking.com",
  "fullName": "New User",
  "mobileNo": "9876500000",
  "accessType": "SUB_ADMIN",
  "department": "Operations",
  "permissions": ["manage_loans", "manage_payments"]
}

5. PATCH /api/settings/users/:id
- Headers: Authorization required
- Auth/RBAC: SUPER_ADMIN

6. PATCH /api/settings/users/:id/status
- Headers: Authorization required
- Auth/RBAC: SUPER_ADMIN

Request:
{
  "isActive": false
}

### H. Profile and Audit
Used by Profile page and enterprise audit use case.

1. GET /api/auth/me (recommended)
- Headers: Authorization required
- Auth/RBAC: any authenticated user
- Purpose: stable source for current user profile, permissions, 2FA flags

2. PATCH /api/auth/me (recommended)
- Headers: Authorization required
- Auth/RBAC: any authenticated user
- Purpose: update profile and security preferences (for example 2FA toggle)

3. GET /api/audit-logs
- Query: page, limit, action, entityType
- Headers: Authorization required
- Auth/RBAC: audit_logs

## Security Requirements (Must Implement)

1) Transport and browser security
- Enforce HTTPS only (TLS 1.2+).
- Send HSTS header.
- Use strict CORS allow-list for production domains.
- Add security headers: Content-Security-Policy, X-Content-Type-Options, Referrer-Policy, X-Frame-Options or frame-ancestors.

2) Token handling and session controls
- Rotate refresh token on each refresh.
- Revoke session on logout and on user deactivation.
- Reject reused/old refresh tokens.
- Keep access token short-lived.

3) Authorization and permission checks
- Enforce RBAC in backend for every protected route.
- Never trust frontend role checks alone.
- Return 403 for missing permission and 401 for missing/invalid token.

4) Input validation and output safety
- Validate payloads with schema validation (zod or equivalent).
- Constrain enums for status and access type values.
- Sanitize and length-limit free text (message templates, names).
- Return generic auth errors to avoid credential enumeration.

5) Abuse and fraud controls
- Rate-limit login, OTP send, OTP verify, and SMS endpoints.
- Apply cooldown and max attempt counters for OTP.
- Add idempotency for payment recording to avoid duplicate settlements.
- Record high-risk actions in audit logs.

6) Data protection and compliance
- Hash passwords with bcrypt (cost >= 10).
- Do not log full OTP, passwords, tokens, or PII in plain text.
- Mask mobile in API responses where full value is not required.
- Implement retention policy for audit and sms logs.

## Endpoint Naming Alignment Note
Current docs contain both verify endpoint names:
- /api/verify/check-otp
- /api/verify/verify-otp

Recommendation:
- Standardize to one path across frontend and backend. Suggested: /api/verify/verify-otp.

## Source Mapping Used
This API list was derived from:
- docs/userflow.md
- docs/system-design.md
- src/components/*
- src/services/mobileVerification.ts
- src/store/authStore.ts
- src/data/mockData.ts
