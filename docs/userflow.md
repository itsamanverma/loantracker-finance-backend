# 🔄 USER FLOWS — LoanTracker Pro

**Version:** 2.1  
**Date:** May 2026  
**Status:** Production-Ready MVP Flows

---

## 📋 Overview

This document covers all primary user journeys across the LoanTracker Pro backend system — from authentication to loan lifecycle management, payment recording, SMS broadcasts, and administrative configuration. Flows are mapped per role and annotated with API endpoints.

---

## 👥 Role Reference

| Role | Capabilities |
|------|-------------|
| **SUPER_ADMIN** | All actions: user management, config, all modules |
| **ADMIN** | Loans, payments, reports, exports, audit logs |
| **SUB_ADMIN** | View and record loans/payments only |

---

## 1. 🔐 Authentication Flows

### 1.1 User Login

```mermaid
sequenceDiagram
    actor User
    participant Frontend
    participant API as Fastify API
    participant DB as PostgreSQL
    participant Cache as Redis

    User->>Frontend: Enter email & password
    Frontend->>API: POST /api/auth/login
    API->>DB: SELECT user WHERE email = ?
    DB-->>API: User record
    API->>API: bcrypt.compare(password, passwordHash)
    alt Invalid credentials
        API-->>Frontend: 401 { error: "Invalid email or password" }
    else Account deactivated
        API-->>Frontend: 403 { error: "Account deactivated" }
    else Valid
        API->>API: Sign JWT (accessToken: 15m, refreshToken: 7d)
        API->>Cache: SET session:{userId} = refreshToken (TTL: 7d)
        API->>DB: UPDATE users SET loginCount++, lastLogin = now()
        API-->>Frontend: 200 { accessToken, refreshToken, user }
        Frontend->>Frontend: Store tokens, redirect to Dashboard
    end
```

**Endpoint:** `POST /api/auth/login`  
**Request Body:**
```json
{ "email": "admin@loantracker.in", "password": "securepass123" }
```
**Success Response:**
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": {
    "id": 1,
    "email": "admin@loantracker.in",
    "full_name": "Rohit Sharma",
    "access_type": "ADMIN",
    "department": "Operations",
    "permissions": ["manage_loans", "manage_payments", "view_reports"]
  }
}
```

---

### 1.2 User Logout

```mermaid
flowchart LR
    A[User clicks Logout] --> B["POST /api/auth/logout\n(Bearer token in header)"]
    B --> C[Verify JWT]
    C --> D["DELETE session:{userId} from Redis"]
    D --> E[200 { success: true }]
    E --> F[Frontend clears tokens\nRedirect to Login]
```

**Endpoint:** `POST /api/auth/logout`  
**Headers:** `Authorization: Bearer <accessToken>`

---

## 2. 📝 Loan Management Flows

### 2.1 Create Loan — 3-Step Wizard

```mermaid
flowchart TD
    A([Start: ADMIN or SUPER_ADMIN]) --> B

    subgraph STEP1 ["Step 1 — Customer Details"]
        B[Enter Customer Name & Mobile] --> C{Mobile already\nexists in DB?}
        C -->|New Customer| D[Proceed to Step 2]
        C -->|Existing Customer| E[Show existing loan\nwarning modal]
        E --> D
    end

    subgraph STEP2 ["Step 2 — Mobile OTP Verification"]
        D --> F["POST /api/verify/send-otp\n(mobile number)"]
        F --> G["AWS SNS sends 6-digit OTP\nOTP saved in Redis\nTTL: 5 minutes"]
        G --> H[User enters OTP in UI]
        H --> I["POST /api/verify/verify-otp\n(mobile, otp)"]
        I --> J{OTP valid\n& not expired?}
        J -->|Invalid / Expired| K[Show error\nAllow Resend after 30s]
        K --> H
        J -->|Valid| L["Redis: SET verified:{mobile} = token\nTTL: 10 minutes"]
        L --> M[✅ Verified — Proceed to Step 3]
    end

    subgraph STEP3 ["Step 3 — Loan Parameters"]
        M --> N[Select Loan Amount & Duration]
        N --> O["UI auto-calculates EMI & Total Amount\nbased on default rate from InterestRate table"]
        O --> O2{Override with\ncustom rate?}
        O2 -->|No| P["Use default rate from interest_rates table\n(e.g. 9.5% for 6 months)"]
        O2 -->|Yes| P2["Agent enters custom rate % p.a.\n(e.g. 7.5% for special scheme)"]
        P & P2 --> P3["EMI live-preview updates:\nemiAmount = principal × r(1+r)^n / ((1+r)^n−1)"]
        P3 --> Q[User confirms & clicks Create Loan]
        Q --> R["POST /api/loans\n{ customerName, customerMobile,\n  amount, durationMonths, verificationToken,\n  customInterestRate? (optional) }"]
        R --> S{Verified token\nvalid in Redis?}
        S -->|Not found / Mismatch| T[400 — Mobile must be re-verified]
        S -->|Valid| U["Resolve interest rate:\ncustomInterestRate ?? InterestRate table lookup"]
        U --> V["DB Transaction:\n1. INSERT loan (with resolved rate stored immutably)\n2. INSERT payment schedule (N installments)\n3. DELETE verified:{mobile} from Redis"]
        V --> W[201 { success: true, loan }]
        W --> X([Loan created & appears in table])
    end
```

**Endpoints:**
| Step | Method | Path | Permission |
|------|--------|------|------------|
| Send OTP | `POST` | `/api/verify/send-otp` | `manage_loans` |
| Verify OTP | `POST` | `/api/verify/verify-otp` | `manage_loans` |
| Create Loan | `POST` | `/api/loans` | `manage_loans` |

**Create Loan Request Body:**
```json
{
  "customerName": "Priya Singh",
  "customerMobile": "9876543210",
  "amount": 500000,
  "durationMonths": 6,
  "verificationToken": "uuid-from-redis",
  "customInterestRate": 7.5
}
```
> `customInterestRate` is **optional**. When omitted, the rate is resolved from the `interest_rates` table (e.g. `9.5%` for 6 months). When provided, it overrides the default and is stored immutably on the loan record.

---

### 2.4 Custom Interest Rate Resolution Logic

```mermaid
flowchart TD
    A[POST /api/loans body received] --> B{customInterestRate\nprovided in request?}
    B -->|Yes| C["Use customInterestRate\n(e.g. 7.5% — special scheme)"]
    B -->|No| D["Lookup interest_rates table\nWHERE durationMonths = ?"]
    D --> E{Rate config\nfound?}
    E -->|No| F[400 — Rate config missing for this duration]
    E -->|Yes| G[Use default rate from table]
    C & G --> H["Calculate EMI:\nmonthlyRate = rate / 12 / 100\nemiAmount = P × r(1+r)^n / ((1+r)^n − 1)"]
    H --> I[Store resolved rate in loans.interestRate\n— immutable after creation]
    I --> J[Generate payment schedule with this rate]
```

**Key Rules:**
- The resolved rate (custom or default) is **always stored** on `loans.interestRate` at creation time — it never changes even if the admin later updates the `interest_rates` table.
- There is **no min/max cap** enforced at the DB level — validation should be applied in the API layer (e.g. `zod`: `z.number().min(1).max(50)`).
- Only users with `manage_loans` permission (or `SUPER_ADMIN`) can create loans with custom rates.
- Custom rates are visible in the Loans table under the **Rate** column and in the loan detail modal.

---

### 2.2 List & Search Loans

```mermaid
flowchart LR
    A[User opens Loans Page] --> B["GET /api/loans\n?page=1&limit=10\n&search=Priya\n&status=ACTIVE"]
    B --> C[JWT Verified + Permission: manage_loans]
    C --> D["DB: SELECT loans WHERE\nstatus = 'ACTIVE' AND\ncustomerName ILIKE '%Priya%'\nLIMIT 10 OFFSET 0"]
    D --> E["200 { loans: [...], pagination: { total, page, totalPages } }"]
    E --> F[Render paginated table\nwith sort controls]
```

**Endpoint:** `GET /api/loans`  
**Query Params:** `page`, `limit`, `search` (name/mobile), `status`

---

### 2.3 Update Loan Status

```mermaid
flowchart TD
    A[ADMIN selects loan → Change Status] --> B["PATCH /api/loans/:id/status\n{ status: 'DEFAULT' }"]
    B --> C[Authenticate + Permission Check]
    C --> D["DB: UPDATE loans SET status = 'DEFAULT'"]
    D --> E["AuditLog: INSERT\n{ action: UPDATE_LOAN_STATUS, entityId: loanId }"]
    E --> F[200 — Loan status updated]
```

**Endpoint:** `PATCH /api/loans/:id/status`  
**Body:** `{ "status": "DEFAULT" | "ACTIVE" | "CLOSED" | "PENDING" }`

---

## 3. 💳 Payment Recording Flows

### 3.1 Record a Payment

```mermaid
sequenceDiagram
    actor Admin
    participant UI
    participant API
    participant DB

    Admin->>UI: Open loan → Click "Record Payment"
    UI->>UI: Show modal with current due installment
    Admin->>UI: Enter amount & confirm
    UI->>API: POST /api/payments\n{ loanId, installmentId, amount, paidDate }
    API->>API: Verify JWT + manage_payments permission
    API->>DB: UPDATE payments SET status='PAID', paidDate=? WHERE id=?
    DB-->>API: Updated payment record
    API->>DB: SELECT COUNT(*) FROM payments WHERE loanId=? AND status!='PAID'
    alt All installments paid
        API->>DB: UPDATE loans SET status='CLOSED' WHERE id=?
    else First payment (was PENDING)
        API->>DB: UPDATE loans SET status='ACTIVE' WHERE id=?
    end
    API->>DB: INSERT INTO audit_logs (action='RECORD_PAYMENT', ...)
    API-->>UI: 200 { success: true, payment }
    UI->>UI: Refresh payment schedule table
```

**Endpoint:** `POST /api/payments`  
**Body:**
```json
{
  "loan_id": 42,
  "amount": 12500.00,
  "paid_date": "2026-05-27"
}
```

---

### 3.2 View Payment Schedule for a Loan

```mermaid
flowchart LR
    A[User clicks loan row] --> B["GET /api/payments?loanId=42"]
    B --> C[Auth + Permission Check]
    C --> D["DB: SELECT * FROM payments\nWHERE loanId = 42\nORDER BY installment ASC"]
    D --> E["200 { payments: [\n  { installment: 1, dueDate, amount, status: 'PAID' },\n  { installment: 2, dueDate, amount, status: 'OVERDUE' },\n  ...\n] }"]
```

---

## 4. 📱 Mobile OTP Verification Flow

### 4.1 Standard OTP via SMS

```mermaid
flowchart TD
    A[Loan wizard: Step 2] --> B["POST /api/verify/send-otp\n{ mobile: '9876543210' }"]
    B --> C{Cooldown active?\nRedis: cooldown:{mobile}}
    C -->|Yes| D[429 — Wait 30 seconds]
    C -->|No| E[Generate 6-digit OTP]
    E --> F["Redis: SET otp:{mobile} = 123456\nTTL: 5 minutes"]
    F --> G["Redis: SET cooldown:{mobile} = timestamp\nTTL: 30 seconds"]
    G --> H[AWS SNS: SendMessage to mobile]
    H --> I[200 — OTP sent]
    I --> J[User enters OTP in UI]
    J --> K["POST /api/verify/verify-otp\n{ mobile, otp }"]
    K --> L{Redis otp:{mobile}\nmatches input?}
    L -->|No / Expired| M[400 — Invalid OTP]
    L -->|Yes| N["Redis: DELETE otp:{mobile}\nSET verified:{mobile} = uuid token\nTTL: 10 minutes"]
    N --> O[200 { verified: true, token: 'uuid' }]
    O --> P[Wizard advances to Step 3]
```

---

### 4.2 WhatsApp Fallback Verification

```mermaid
flowchart TD
    A[User clicks 'Send via WhatsApp'] --> B["POST /api/verify/send-whatsapp\n{ mobile }"]
    B --> C[WhatsApp Business API:\nSend template message\n'Reply YES to verify your number']
    C --> D[Webhook receives 'YES' reply]
    D --> E["Redis: SET verified:{mobile} = uuid token\nTTL: 10 minutes"]
    E --> F[200 — Mobile verified via WhatsApp]
```

---

## 5. 📊 Dashboard & Reports Flows

### 5.1 Dashboard Metrics Load

```mermaid
flowchart LR
    A[User logs in → Dashboard] --> B["GET /api/dashboard/stats"]
    B --> C[Auth Check]
    C --> D["DB queries (parallel):\n- COUNT loans by status\n- SUM amount disbursed\n- SUM payments.amount WHERE status=PAID\n- COUNT overdue payments\n- Monthly collection aggregates (12 months)"]
    D --> E["200 { DashboardStats }"]
    E --> F["Render:\n- KPI cards\n- Collection trend chart\n- Status donut chart\n- Recent loans & payments feeds"]
```

**Response Shape:**
```json
{
  "totalLoans": 142,
  "activeLoans": 87,
  "totalDisbursed": 4280000,
  "totalCollected": 2940000,
  "pendingPayments": 34,
  "overduePayments": 12,
  "monthlyCollections": [
    { "month": "2026-05", "amount": 320000 },
    { "month": "2026-04", "amount": 290000 }
  ],
  "loansByStatus": [
    { "status": "ACTIVE", "count": 87 },
    { "status": "CLOSED", "count": 43 },
    { "status": "PENDING", "count": 8 },
    { "status": "DEFAULT", "count": 4 }
  ]
}
```

---

### 5.2 View Delinquency Report

```mermaid
flowchart LR
    A[Admin opens Reports Page] --> B["GET /api/reports/delinquencies\n?page=1&limit=20"]
    B --> C[Permission: view_reports]
    C --> D["DB: SELECT loans WHERE\nstatus = 'ACTIVE' AND\nid IN (SELECT loanId FROM payments\n       WHERE status = 'OVERDUE')"]
    D --> E["200 { delinquentLoans: [...] }"]
    E --> F[Render delinquency list\nwith borrower details & overdue amounts]
```

---

## 6. 📨 SMS Broadcast Flows

### 6.1 Single Borrower SMS

```mermaid
flowchart TD
    A[Admin selects one delinquent borrower] --> B[Customizes message template\n{{name}}, {{amount}}, {{due_date}}]
    B --> C["POST /api/sms/send\n{ loanId, mobile, message }"]
    C --> D[Permission: manage_loans]
    D --> E[AWS SNS: Publish to mobile]
    E --> F{Sent?}
    F -->|Success| G["DB: INSERT sms_logs { status: 'SENT' }"]
    F -->|Failure| H["DB: INSERT sms_logs { status: 'FAILED' }"]
    G & H --> I["DB: INSERT audit_logs\n{ action: SMS_BROADCAST }"]
    I --> J[200 — SMS dispatched]
```

---

### 6.2 Bulk SMS Broadcast

```mermaid
flowchart TD
    A[Admin selects ALL delinquent borrowers] --> B[Sets broadcast template]
    B --> C["POST /api/sms/broadcast\n{ loanIds: [1,2,3,...], template }"]
    C --> D[Permission: manage_loans]
    D --> E[For each loanId:]
    E --> F[Resolve borrower name, amount, due_date\nfrom DB]
    F --> G[Interpolate message template]
    G --> H[AWS SNS: Publish SMS]
    H --> I["INSERT sms_logs (SENT or FAILED)"]
    I --> J{More loans?}
    J -->|Yes| E
    J -->|No| K["INSERT audit_logs { action: SMS_BROADCAST,\ndetails: { count, successCount, failCount } }"]
    K --> L["200 { dispatched: 18, failed: 2 }"]
```

---

## 7. ⚙️ Settings & Configuration Flows

### 7.1 Update Interest Rates (SUPER_ADMIN only)

```mermaid
flowchart TD
    A[Super Admin → Settings → Interest Rates tab] --> B[Edits rate for 6 months from 9.5% to 10%]
    B --> C["PUT /api/settings/interest-rates\n{ durationMonths: 6, interestRate: 10.0 }"]
    C --> D{accessType === SUPER_ADMIN\nor permission: system_config}
    D -->|No| E[403 Forbidden]
    D -->|Yes| F["DB: UPDATE interest_rates\nSET interestRate = 10.0\nWHERE durationMonths = 6"]
    F --> G["INSERT audit_logs\n{ action: UPDATE_INTEREST_RATES }"]
    G --> H[200 — Rate updated]
    H --> I[New loans use updated rate immediately]
```

---

### 7.2 User Account Management (SUPER_ADMIN only)

```mermaid
flowchart TD
    A([Super Admin → Settings → Users tab]) --> B

    B{Action chosen}
    B -->|Add User| C["POST /api/settings/users\n{ email, fullName, mobileNo,\n  accessType, department, permissions }"]
    C --> D["DB: INSERT user\nbcrypt.hash(tempPassword, 12)"]
    D --> E["INSERT audit_logs { action: CREATE_USER }"]
    E --> F[201 — User created]

    B -->|Edit User| G["PATCH /api/settings/users/:id\n{ permissions: [...], department }"]
    G --> H["DB: UPDATE users\nSET permissions = [...] WHERE id = ?"]
    H --> I["INSERT audit_logs { action: UPDATE_USER }"]
    I --> J[200 — User updated]

    B -->|Toggle Active| K["PATCH /api/settings/users/:id/status\n{ isActive: false }"]
    K --> L["DB: UPDATE users\nSET isActive = false WHERE id = ?"]
    L --> M["Redis: DELETE session:{userId}\n(force logout)"]
    M --> N["INSERT audit_logs { action: DEACTIVATE_USER }"]
    N --> O[200 — Account deactivated]
```

---

## 8. 📂 Data Export Flow

```mermaid
flowchart TD
    A[User → Export Page] --> B[Sets filters:\nDate range, Status, Format: CSV/JSON]
    B --> C["GET /api/export/loans\n?startDate=2026-01-01\n&endDate=2026-05-31\n&status=ACTIVE\n&format=csv"]
    C --> D[Permission: export_data]
    D --> E["DB: SELECT loans\nWHERE createdAt BETWEEN ? AND ?\nAND status = 'ACTIVE'"]
    E --> F{Format?}
    F -->|CSV| G[Serialize to CSV string\nContent-Type: text/csv]
    F -->|JSON| H[Serialize to JSON array\nContent-Type: application/json]
    G & H --> I["INSERT audit_logs { action: EXPORT_DATA,\ndetails: { recordCount, filters } }"]
    I --> J[File download triggered\nFilename: loans_export_2026-05-27.csv]
```

---

## 9. 📋 Audit Log View Flow

```mermaid
flowchart LR
    A[Admin/SuperAdmin → Audit Logs] --> B["GET /api/audit-logs\n?page=1&limit=25\n&action=RECORD_PAYMENT"]
    B --> C[Permission: audit_logs]
    C --> D["DB: SELECT audit_logs\nJOIN users ON userId\nWHERE action = 'RECORD_PAYMENT'\nORDER BY createdAt DESC\nLIMIT 25 OFFSET 0"]
    D --> E["200 { logs: [\n  { action, entityType, entityId,\n    user: { fullName },\n    details, ipAddress, createdAt }\n], pagination }"]
```

---

## 📡 Complete API Endpoint Reference

| Module | Method | Path | Permission Required | Description |
|--------|--------|------|---------------------|-------------|
| **Auth** | `POST` | `/api/auth/login` | None | User login |
| **Auth** | `POST` | `/api/auth/logout` | Authenticated | User logout |
| **Loans** | `GET` | `/api/loans` | `manage_loans` | List & search loans |
| **Loans** | `POST` | `/api/loans` | `manage_loans` | Create new loan |
| **Loans** | `GET` | `/api/loans/:id` | `manage_loans` | Get loan details |
| **Loans** | `PATCH` | `/api/loans/:id/status` | `manage_loans` | Update loan status |
| **Payments** | `GET` | `/api/payments` | `manage_payments` | List all payments |
| **Payments** | `GET` | `/api/payments?loanId=X` | `manage_payments` | Get loan installments |
| **Payments** | `POST` | `/api/payments` | `manage_payments` | Record a payment |
| **Verify** | `POST` | `/api/verify/send-otp` | `manage_loans` | Send OTP via SMS |
| **Verify** | `POST` | `/api/verify/verify-otp` | `manage_loans` | Verify OTP code |
| **Verify** | `POST` | `/api/verify/send-whatsapp` | `manage_loans` | Send WhatsApp verification |
| **SMS** | `POST` | `/api/sms/send` | `manage_loans` | Send single SMS |
| **SMS** | `POST` | `/api/sms/broadcast` | `manage_loans` | Bulk SMS broadcast |
| **Dashboard** | `GET` | `/api/dashboard/stats` | Authenticated | Fetch KPI metrics |
| **Reports** | `GET` | `/api/reports/delinquencies` | `view_reports` | Delinquent loans list |
| **Export** | `GET` | `/api/export/loans` | `export_data` | Export loans as CSV/JSON |
| **Settings** | `GET` | `/api/settings/interest-rates` | `system_config` | Get interest rate config |
| **Settings** | `PUT` | `/api/settings/interest-rates` | `system_config` | Update interest rate |
| **Settings** | `GET` | `/api/settings/users` | SUPER_ADMIN | List all users |
| **Settings** | `POST` | `/api/settings/users` | SUPER_ADMIN | Create new user |
| **Settings** | `PATCH` | `/api/settings/users/:id` | SUPER_ADMIN | Update user details |
| **Settings** | `PATCH` | `/api/settings/users/:id/status` | SUPER_ADMIN | Toggle user active state |
| **Audit** | `GET` | `/api/audit-logs` | `audit_logs` | View audit trail |

---

## 🔐 Permission Matrix

| Action | SUPER_ADMIN | ADMIN | SUB_ADMIN |
|--------|:-----------:|:-----:|:---------:|
| Login / Logout | ✅ | ✅ | ✅ |
| View Dashboard | ✅ | ✅ | ✅ |
| Create Loan | ✅ | ✅ (if permitted) | ❌ |
| View Loans | ✅ | ✅ | ✅ |
| Update Loan Status | ✅ | ✅ (if permitted) | ❌ |
| Record Payment | ✅ | ✅ (if permitted) | ✅ (if permitted) |
| Send SMS | ✅ | ✅ (if permitted) | ❌ |
| View Reports | ✅ | ✅ (if permitted) | ❌ |
| Export Data | ✅ | ✅ (if permitted) | ❌ |
| View Audit Logs | ✅ | ✅ (if permitted) | ❌ |
| Manage Interest Rates | ✅ | ❌ | ❌ |
| Create/Edit Users | ✅ | ❌ | ❌ |
| Deactivate Users | ✅ | ❌ | ❌ |
