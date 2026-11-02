# 🚀 LoanTracker Pro API Documentation

**Base URL (Local):** `http://localhost:3000`  
**Base URL (Cloudflare Tunnel):** `API requests behind the scenes to your Cloudflare backend at 
https://picks-complement-legitimate-muscle.trycloudflare.com.

Why the Create Loan request failed with 400:
In your last request, the browser sent: verificationToken: ""

This happens because the mobile number 7880467881 was not verified prior to submitting. Whenever you enter/change a mobile number in the modal, you must:

Click Send OTP.
Enter the OTP 123456.
Click Verify OTP.
Once verified, the green checkmark/box will display showing your verification token.
Click Create Loan to successfully save it.`  
*(Note: Run `npm run tunnel` for Pinggy, or `npm run tunnel:cf` for Cloudflare Tunnel to generate a live, public HTTPS URL for testing. Tunnels are perfect for quick mobile demos as the URL changes on restart).*

---

## 🚀 Backend Local Setup (Dependencies)
This project uses **Docker** to manage its PostgreSQL database. 

1. Ensure Docker is running.
2. Start the database container: 
   `docker run --name loan-pg-db -e POSTGRES_USER=loantracker_user -e POSTGRES_PASSWORD=admin123 -e POSTGRES_DB=loantracker_db -p 5433:5432 -d postgres:16-alpine`
3. Run `npm run dev` to start the backend.

---

## 🌍 CORS & Origin Policy (Integration Check)

This backend is secured with strict Cross-Origin Resource Sharing (CORS) rules. 

**Pre-Allowed Origins:**
- `http://localhost:3000` (Local frontend dev)
- `http://localhost:5173` (Vite frontend dev)
- `http://127.0.0.1:3000`
- **Dynamic Pinggy Subdomains:** Any origin matching the pattern `^https:\/\/[a-z0-9.-]+\.(pinggy\.io|pinggy-free\.link)$` is automatically allowed.
- **Dynamic Cloudflare Subdomains:** Any origin matching the pattern `^https:\/\/[a-z0-9.-]+\.trycloudflare\.com$` is automatically allowed.
This means **you do not need to update CORS configurations when the Pinggy or Cloudflare Tunnel URL changes**.

**Custom Origins:**
If you host the frontend on Vercel, Netlify, or another domain, you must add it to the `.env` file:
```env
ALLOWED_ORIGINS=https://my-frontend.vercel.app,https://another-domain.com
```

---

## 🌐 Exposing Backend via Cloudflare Tunnel (Quick Demo)

For a quick demo or testing with the mobile team (e.g. setting `BASE_URL` in Flutter/React Native), you can tunnel your local server using Cloudflare. The generated URL is public, secured with HTTPS, and automatically passes the CORS policy.

### 1. Install cloudflared
Install Cloudflare's tunnel agent on your local machine:
```bash
# Using npm
npm install -g cloudflared

# Or on macOS via Homebrew
brew install cloudflared

# Or on Linux via APT
sudo apt-get install cloudflared
```

### 2. Start Backend & Tunnel
1. Start your local backend server:
   ```bash
   npm run dev
   ```
2. Start the tunnel in a separate terminal:
   ```bash
   npm run tunnel:cf
   ```
   *(Alternatively, run `cloudflared tunnel --url http://localhost:3000` directly).*

The terminal will print a live random URL ending in `.trycloudflare.com`, for example:
`https://random-words-here.trycloudflare.com`

### 3. Share with the Mobile Team
Share the public URL with your mobile team. They can set it as the `BASE_URL` in Flutter or native apps. The tunnel remains active and accessible until you terminate the CLI process.

---

## ⚡ Performance & Response Compression

To optimize network performance, reduce latency, and minimize data usage for mobile/web clients, the backend is equipped with automatic response compression using `@fastify/compress`:

- **Threshold:** Responses larger than **1 KB (1024 bytes)** are automatically compressed.
- **Algorithms:** Supports Brotli, Gzip, and Deflate compression formats.
- **Client Usage:** Ensure your request includes the `Accept-Encoding: gzip, deflate, br` header. Most modern HTTP clients (e.g. `axios` in JS/TS, `dio` or `http` in Flutter/Dart, and native web browsers) do this automatically and handle decompression transparently.

---

## 🔐 Authentication & Security

All API requests (except public endpoints like login and health check) require authentication headers.

| Header | Value | Description |
|--------|-------|-------------|
| `Authorization` | `Bearer <accessToken>` | Obtained from the `/api/auth/login` endpoint. Expires every 15 minutes. |
| `X-API-Key` | `lntrack-dev-api-key-change-in-prod` | **(Optional)** Used for Swagger UI or bypassing JWT during direct testing (if enabled). |

---

## 👤 1. Authentication (Auth)

### Login
- **Endpoint:** `POST /api/auth/login`
- **Security:** Public
- **cURL Example:**
  ```bash
  curl -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{
      "email": "admin@loantracker.in",
      "password": "Admin@123"
    }'
  ```
- **Example Response:**
  ```json
  {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6Ik...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6Ik...",
    "user": {
      "id": 1,
      "email": "admin@loantracker.in",
      "full_name": "System Admin",
      "access_type": "ADMIN",
      "department": "Operations",
      "permissions": ["manage_loans", "manage_payments", "view_reports"]
    }
  }
  ```

### Refresh Token
- **Endpoint:** `POST /api/auth/refresh`
- **Security:** Public
- **cURL Example:**
  ```bash
  curl -X POST http://localhost:3000/api/auth/refresh \
    -H "Content-Type: application/json" \
    -d '{
      "refreshToken": "<your_refresh_token_here>"
    }'
  ```
- **Example Response:**
  ```json
  {
    "accessToken": "new_eyJhbGciOiJIUzI1NiIsInR5cCI...",
    "refreshToken": "new_eyJhbGciOiJIUzI1NiIsInR5cCI..."
  }
  ```

### Get Current User (Profile)
- **Endpoint:** `GET /api/auth/me`
- **Security:** `Bearer Token`
- **cURL Example:**
  ```bash
  curl -X GET http://localhost:3000/api/auth/me \
    -H "Authorization: Bearer <accessToken>"
  ```
- **Example Response:**
  ```json
  {
    "success": true,
    "data": {
      "id": 1,
      "email": "admin@loantracker.in",
      "fullName": "System Admin",
      "mobileNo": "9876543210",
      "accessType": "ADMIN",
      "department": "Operations",
      "permissions": ["manage_loans", "manage_payments"],
      "isActive": true,
      "loginCount": 5,
      "lastLogin": "2026-05-27T10:00:00.000Z",
      "createdAt": "2026-05-01T10:00:00.000Z"
    }
  }
  ```

### Logout
- **Endpoint:** `POST /api/auth/logout`
- **Security:** `Bearer Token`
- **cURL Example:**
  ```bash
  curl -X POST http://localhost:3000/api/auth/logout \
    -H "Authorization: Bearer <accessToken>"
  ```
- **Example Response:**
  ```json
  {
    "success": true
  }
  ```

### Create User
- **Endpoint:** `POST /api/settings/users`
- **Security:** `Bearer Token` (Requires `SUPER_ADMIN` role)
- **cURL Example:**
  ```bash
  curl -X POST http://localhost:3000/api/settings/users \
    -H "Authorization: Bearer <accessToken>" \
    -H "Content-Type: application/json" \
    -d '{
      "email": "newadmin@loantracker.in",
      "fullName": "New Admin",
      "mobileNo": "9988776655",
      "accessType": "ADMIN"
    }'
  ```

### Update User
- **Endpoint:** `PATCH /api/settings/users/:id`
- **Security:** `Bearer Token` (Requires `SUPER_ADMIN` role)
- **cURL Example:**
  ```bash
  curl -X PATCH http://localhost:3000/api/settings/users/2 \
    -H "Authorization: Bearer <accessToken>" \
    -H "Content-Type: application/json" \
    -d '{
      "fullName": "Updated Admin Name"
    }'
  ```

### Toggle User Status
- **Endpoint:** `PATCH /api/settings/users/:id/status`
- **Security:** `Bearer Token` (Requires `SUPER_ADMIN` role)
- **cURL Example:**
  ```bash
  curl -X PATCH http://localhost:3000/api/settings/users/2/status \
    -H "Authorization: Bearer <accessToken>" \
    -H "Content-Type: application/json" \
    -d '{
      "isActive": false
    }'
  ```

---

## 💰 2. Loan Management

### List Loans
- **Endpoint:** `GET /api/loans`
- **Security:** `Bearer Token` (Requires `manage_loans` permission)
- **cURL Example:**
  ```bash
  curl -X GET "http://localhost:3000/api/loans?page=1&limit=10&status=ACTIVE" \
    -H "Authorization: Bearer <accessToken>"
  ```
- **Example Response:**
  ```json
  {
    "success": true,
    "data": [
      {
        "id": 42,
        "customerName": "Priya Singh",
        "customerMobile": "9876543210",
        "amount": "500000",
        "status": "ACTIVE",
        "createdAt": "2026-05-27T10:00:00.000Z"
      }
    ],
    "pagination": {
      "total": 1,
      "page": 1,
      "limit": 10,
      "totalPages": 1
    }
  }
  ```

### Get Loan by ID
- **Endpoint:** `GET /api/loans/:id`
- **Security:** `Bearer Token` (Requires `manage_loans` permission)
- **cURL Example:**
  ```bash
  curl -X GET http://localhost:3000/api/loans/42 \
    -H "Authorization: Bearer <accessToken>"
  ```
- **Example Response:**
  ```json
  {
    "success": true,
    "data": {
      "id": 42,
      "customerName": "Priya Singh",
      "amount": "500000",
      "paymentSchedule": []
    }
  }
  ```

### Create Loan
- **Endpoint:** `POST /api/loans`
- **Security:** `Bearer Token` (Requires `manage_loans` permission)
- **cURL Example:**
  ```bash
  curl -X POST http://localhost:3000/api/loans \
    -H "Authorization: Bearer <accessToken>" \
    -H "Content-Type: application/json" \
    -d '{
      "customerName": "Priya Singh",
      "customerMobile": "9876543210",
      "amount": 500000,
      "durationMonths": 6,
      "verificationToken": "abc-123-def",
      "customInterestRate": 9.5
    }'
  ```
- **Example Response:**
  ```json
  {
    "success": true,
    "data": {
      "id": 42,
      "customerName": "Priya Singh",
      "customerMobile": "9876543210",
      "amount": "500000",
      "durationMonths": 6,
      "interestRate": "9.5",
      "emiAmount": "85671.12",
      "totalAmount": "514026.72",
      "status": "PENDING"
    }
  }
  ```

### Update Loan Status
- **Endpoint:** `PATCH /api/loans/:id/status`
- **Security:** `Bearer Token` (Requires `manage_loans` permission)
- **cURL Example:**
  ```bash
  curl -X PATCH http://localhost:3000/api/loans/42/status \
    -H "Authorization: Bearer <accessToken>" \
    -H "Content-Type: application/json" \
    -d '{
      "status": "DEFAULT"
    }'
  ```
- **Example Response:**
  ```json
  {
    "success": true,
    "data": {
      "id": 42,
      "status": "DEFAULT"
    }
  }
  ```

### Create User
- **Endpoint:** `POST /api/settings/users`
- **Security:** `Bearer Token` (Requires `SUPER_ADMIN` role)
- **cURL Example:**
  ```bash
  curl -X POST http://localhost:3000/api/settings/users \
    -H "Authorization: Bearer <accessToken>" \
    -H "Content-Type: application/json" \
    -d '{
      "email": "newadmin@loantracker.in",
      "fullName": "New Admin",
      "mobileNo": "9988776655",
      "accessType": "ADMIN"
    }'
  ```

### Update User
- **Endpoint:** `PATCH /api/settings/users/:id`
- **Security:** `Bearer Token` (Requires `SUPER_ADMIN` role)
- **cURL Example:**
  ```bash
  curl -X PATCH http://localhost:3000/api/settings/users/2 \
    -H "Authorization: Bearer <accessToken>" \
    -H "Content-Type: application/json" \
    -d '{
      "fullName": "Updated Admin Name"
    }'
  ```

### Toggle User Status
- **Endpoint:** `PATCH /api/settings/users/:id/status`
- **Security:** `Bearer Token` (Requires `SUPER_ADMIN` role)
- **cURL Example:**
  ```bash
  curl -X PATCH http://localhost:3000/api/settings/users/2/status \
    -H "Authorization: Bearer <accessToken>" \
    -H "Content-Type: application/json" \
    -d '{
      "isActive": false
    }'
  ```

---

## 💸 3. Payments

### List Payments
- **Endpoint:** `GET /api/payments`
- **Security:** `Bearer Token` (Requires `manage_payments` permission)
- **cURL Example:**
  ```bash
  curl -X GET "http://localhost:3000/api/payments?page=1&limit=10&loanId=42" \
    -H "Authorization: Bearer <accessToken>"
  ```
- **Example Response:**
  ```json
  {
    "success": true,
    "data": [
      {
        "id": 105,
        "loanId": 42,
        "amount": "85671.12",
        "status": "PAID"
      }
    ],
    "pagination": { "total": 1, "page": 1, "limit": 10, "totalPages": 1 }
  }
  ```

### Record a Payment
- **Endpoint:** `POST /api/payments`
- **Security:** `Bearer Token` (Requires `manage_payments` permission)
- **cURL Example:**
  ```bash
  curl -X POST http://localhost:3000/api/payments \
    -H "Authorization: Bearer <accessToken>" \
    -H "Content-Type: application/json" \
    -d '{
      "loan_id": 42,
      "amount": 85671.12,
      "paid_date": "2026-05-27"
    }'
  ```
- **Example Response:**
  ```json
  {
    "success": true,
    "data": {
      "id": 105,
      "loanId": 42,
      "installment": 1,
      "amount": "85671.12",
      "status": "PAID",
      "paidDate": "2026-05-27T00:00:00.000Z"
    }
  }
  ```

### Create User
- **Endpoint:** `POST /api/settings/users`
- **Security:** `Bearer Token` (Requires `SUPER_ADMIN` role)
- **cURL Example:**
  ```bash
  curl -X POST http://localhost:3000/api/settings/users \
    -H "Authorization: Bearer <accessToken>" \
    -H "Content-Type: application/json" \
    -d '{
      "email": "newadmin@loantracker.in",
      "fullName": "New Admin",
      "mobileNo": "9988776655",
      "accessType": "ADMIN"
    }'
  ```

### Update User
- **Endpoint:** `PATCH /api/settings/users/:id`
- **Security:** `Bearer Token` (Requires `SUPER_ADMIN` role)
- **cURL Example:**
  ```bash
  curl -X PATCH http://localhost:3000/api/settings/users/2 \
    -H "Authorization: Bearer <accessToken>" \
    -H "Content-Type: application/json" \
    -d '{
      "fullName": "Updated Admin Name"
    }'
  ```

### Toggle User Status
- **Endpoint:** `PATCH /api/settings/users/:id/status`
- **Security:** `Bearer Token` (Requires `SUPER_ADMIN` role)
- **cURL Example:**
  ```bash
  curl -X PATCH http://localhost:3000/api/settings/users/2/status \
    -H "Authorization: Bearer <accessToken>" \
    -H "Content-Type: application/json" \
    -d '{
      "isActive": false
    }'
  ```

---

## 📱 4. OTP Verification

### Send OTP
- **Endpoint:** `POST /api/verify/send-otp`
- **Security:** `Bearer Token` (Requires `manage_loans` permission)
- **cURL Example:**
  ```bash
  curl -X POST http://localhost:3000/api/verify/send-otp \
    -H "Authorization: Bearer <accessToken>" \
    -H "Content-Type: application/json" \
    -d '{
      "mobile": "9876543210"
    }'
  ```
- **Example Response:**
  ```json
  {
    "success": true,
    "message": "OTP sent successfully."
  }
  ```

### Verify OTP
- **Endpoint:** `POST /api/verify/verify-otp`
- **Security:** `Bearer Token` (Requires `manage_loans` permission)
- **cURL Example:**
  ```bash
  curl -X POST http://localhost:3000/api/verify/verify-otp \
    -H "Authorization: Bearer <accessToken>" \
    -H "Content-Type: application/json" \
    -d '{
      "mobile": "9876543210",
      "otp": "123456"
    }'
  ```
- **Example Response:**
  ```json
  {
    "success": true,
    "verified": true,
    "verificationToken": "550e8400-e29b-41d4-a716-446655440000"
  }
  ```

### Create User
- **Endpoint:** `POST /api/settings/users`
- **Security:** `Bearer Token` (Requires `SUPER_ADMIN` role)
- **cURL Example:**
  ```bash
  curl -X POST http://localhost:3000/api/settings/users \
    -H "Authorization: Bearer <accessToken>" \
    -H "Content-Type: application/json" \
    -d '{
      "email": "newadmin@loantracker.in",
      "fullName": "New Admin",
      "mobileNo": "9988776655",
      "accessType": "ADMIN"
    }'
  ```

### Update User
- **Endpoint:** `PATCH /api/settings/users/:id`
- **Security:** `Bearer Token` (Requires `SUPER_ADMIN` role)
- **cURL Example:**
  ```bash
  curl -X PATCH http://localhost:3000/api/settings/users/2 \
    -H "Authorization: Bearer <accessToken>" \
    -H "Content-Type: application/json" \
    -d '{
      "fullName": "Updated Admin Name"
    }'
  ```

### Toggle User Status
- **Endpoint:** `PATCH /api/settings/users/:id/status`
- **Security:** `Bearer Token` (Requires `SUPER_ADMIN` role)
- **cURL Example:**
  ```bash
  curl -X PATCH http://localhost:3000/api/settings/users/2/status \
    -H "Authorization: Bearer <accessToken>" \
    -H "Content-Type: application/json" \
    -d '{
      "isActive": false
    }'
  ```

---

### Send WhatsApp Verification
- **Endpoint:** `POST /api/verify/send-whatsapp`
- **Security:** `Bearer Token` (Requires `manage_loans` permission)
- **cURL Example:**
  ```bash
  curl -X POST http://localhost:3000/api/verify/send-whatsapp \
    -H "Authorization: Bearer <accessToken>" \
    -H "Content-Type: application/json" \
    -d '{
      "mobile": "9876543210"
    }'
  ```
- **Example Response:**
  ```json
  {
    "success": true,
    "message": "WhatsApp verification sent."
  }
  ```

## 📊 5. Dashboard & Reports

### Get Dashboard Stats
- **Endpoint:** `GET /api/dashboard/stats`
- **Security:** `Bearer Token`
- **cURL Example:**
  ```bash
  curl -X GET http://localhost:3000/api/dashboard/stats \
    -H "Authorization: Bearer <accessToken>"
  ```
- **Example Response:**
  ```json
  {
    "success": true,
    "data": {
      "totalLoans": 150,
      "activeLoans": 120,
      "closedLoans": 25,
      "pendingLoans": 3,
      "defaultLoans": 2,
      "totalDisbursed": 5500000,
      "totalCollected": 1250000,
      "overduePayments": 5,
      "recentLoans": [],
      "recentPayments": []
    }
  }
  ```

### Delinquency Report
- **Endpoint:** `GET /api/reports/delinquencies`
- **Security:** `Bearer Token` (Requires `view_reports` permission)
- **cURL Example:**
  ```bash
  curl -X GET "http://localhost:3000/api/reports/delinquencies?limit=10" \
    -H "Authorization: Bearer <accessToken>"
  ```
- **Example Response:**
  ```json
  {
    "success": true,
    "data": [
      {
        "id": 42,
        "customerName": "Priya Singh",
        "payments": [
          {
            "id": 106,
            "status": "OVERDUE",
            "dueDate": "2026-05-01T00:00:00.000Z"
          }
        ]
      }
    ],
    "pagination": { "total": 1, "page": 1, "limit": 10, "totalPages": 1 }
  }
  ```

### Create User
- **Endpoint:** `POST /api/settings/users`
- **Security:** `Bearer Token` (Requires `SUPER_ADMIN` role)
- **cURL Example:**
  ```bash
  curl -X POST http://localhost:3000/api/settings/users \
    -H "Authorization: Bearer <accessToken>" \
    -H "Content-Type: application/json" \
    -d '{
      "email": "newadmin@loantracker.in",
      "fullName": "New Admin",
      "mobileNo": "9988776655",
      "accessType": "ADMIN"
    }'
  ```

### Update User
- **Endpoint:** `PATCH /api/settings/users/:id`
- **Security:** `Bearer Token` (Requires `SUPER_ADMIN` role)
- **cURL Example:**
  ```bash
  curl -X PATCH http://localhost:3000/api/settings/users/2 \
    -H "Authorization: Bearer <accessToken>" \
    -H "Content-Type: application/json" \
    -d '{
      "fullName": "Updated Admin Name"
    }'
  ```

### Toggle User Status
- **Endpoint:** `PATCH /api/settings/users/:id/status`
- **Security:** `Bearer Token` (Requires `SUPER_ADMIN` role)
- **cURL Example:**
  ```bash
  curl -X PATCH http://localhost:3000/api/settings/users/2/status \
    -H "Authorization: Bearer <accessToken>" \
    -H "Content-Type: application/json" \
    -d '{
      "isActive": false
    }'
  ```

---

## 💬 6. SMS Broadcasting

### Send Single SMS
- **Endpoint:** `POST /api/sms/send`
- **Security:** `Bearer Token` (Requires `manage_loans` permission)
- **cURL Example:**
  ```bash
  curl -X POST http://localhost:3000/api/sms/send \
    -H "Authorization: Bearer <accessToken>" \
    -H "Content-Type: application/json" \
    -d '{
      "loanId": 42,
      "mobile": "9876543210",
      "message": "Dear Priya, your EMI of ₹12500 is due on 2026-06-01. — LoanTracker"
    }'
  ```
- **Example Response:**
  ```json
  {
    "success": true,
    "message": "SMS sent successfully."
  }
  ```

### Broadcast Bulk SMS
- **Endpoint:** `POST /api/sms/broadcast`
- **Security:** `Bearer Token` (Requires `manage_loans` permission)
- **cURL Example:**
  ```bash
  curl -X POST http://localhost:3000/api/sms/broadcast \
    -H "Authorization: Bearer <accessToken>" \
    -H "Content-Type: application/json" \
    -d '{
      "loanIds": [1, 2, 3],
      "template": "Dear {{name}}, your overdue EMI of ₹{{amount}} was due on {{due_date}}."
    }'
  ```
- **Example Response:**
  ```json
  {
    "success": true,
    "dispatched": 3,
    "failed": 0
  }
  ```

### Create User
- **Endpoint:** `POST /api/settings/users`
- **Security:** `Bearer Token` (Requires `SUPER_ADMIN` role)
- **cURL Example:**
  ```bash
  curl -X POST http://localhost:3000/api/settings/users \
    -H "Authorization: Bearer <accessToken>" \
    -H "Content-Type: application/json" \
    -d '{
      "email": "newadmin@loantracker.in",
      "fullName": "New Admin",
      "mobileNo": "9988776655",
      "accessType": "ADMIN"
    }'
  ```

### Update User
- **Endpoint:** `PATCH /api/settings/users/:id`
- **Security:** `Bearer Token` (Requires `SUPER_ADMIN` role)
- **cURL Example:**
  ```bash
  curl -X PATCH http://localhost:3000/api/settings/users/2 \
    -H "Authorization: Bearer <accessToken>" \
    -H "Content-Type: application/json" \
    -d '{
      "fullName": "Updated Admin Name"
    }'
  ```

### Toggle User Status
- **Endpoint:** `PATCH /api/settings/users/:id/status`
- **Security:** `Bearer Token` (Requires `SUPER_ADMIN` role)
- **cURL Example:**
  ```bash
  curl -X PATCH http://localhost:3000/api/settings/users/2/status \
    -H "Authorization: Bearer <accessToken>" \
    -H "Content-Type: application/json" \
    -d '{
      "isActive": false
    }'
  ```

---

## ⚙️ 7. System Settings (Super Admin)

### Get Interest Rates
- **Endpoint:** `GET /api/settings/interest-rates`
- **Security:** `Bearer Token` (Requires `system_config` permission)
- **cURL Example:**
  ```bash
  curl -X GET http://localhost:3000/api/settings/interest-rates \
    -H "Authorization: Bearer <accessToken>"
  ```
- **Example Response:**
  ```json
  {
    "success": true,
    "data": [
      {
        "id": 1,
        "durationMonths": 6,
        "interestRate": "9.5"
      }
    ]
  }
  ```

### Update Interest Rates
- **Endpoint:** `PUT /api/settings/interest-rates`
- **Security:** `Bearer Token` (Requires `system_config` permission)
- **cURL Example:**
  ```bash
  curl -X PUT http://localhost:3000/api/settings/interest-rates \
    -H "Authorization: Bearer <accessToken>" \
    -H "Content-Type: application/json" \
    -d '{
      "durationMonths": 6,
      "interestRate": 9.5
    }'
  ```
- **Example Response:**
  ```json
  {
    "success": true,
    "data": {
      "id": 1,
      "durationMonths": 6,
      "interestRate": "9.5"
    }
  }
  ```

### List Users
- **Endpoint:** `GET /api/settings/users`
- **Security:** `Bearer Token` (Requires `SUPER_ADMIN` role)
- **cURL Example:**
  ```bash
  curl -X GET http://localhost:3000/api/settings/users \
    -H "Authorization: Bearer <accessToken>"
  ```
- **Example Response:**
  ```json
  {
    "success": true,
    "data": [
      {
        "id": 1,
        "email": "superadmin@loantracker.in",
        "fullName": "Super Admin",
        "accessType": "SUPER_ADMIN"
      }
    ]
  }
  ```

### Create User
- **Endpoint:** `POST /api/settings/users`
- **Security:** `Bearer Token` (Requires `SUPER_ADMIN` role)
- **cURL Example:**
  ```bash
  curl -X POST http://localhost:3000/api/settings/users \
    -H "Authorization: Bearer <accessToken>" \
    -H "Content-Type: application/json" \
    -d '{
      "email": "newadmin@loantracker.in",
      "fullName": "New Admin",
      "mobileNo": "9988776655",
      "accessType": "ADMIN"
    }'
  ```

### Update User
- **Endpoint:** `PATCH /api/settings/users/:id`
- **Security:** `Bearer Token` (Requires `SUPER_ADMIN` role)
- **cURL Example:**
  ```bash
  curl -X PATCH http://localhost:3000/api/settings/users/2 \
    -H "Authorization: Bearer <accessToken>" \
    -H "Content-Type: application/json" \
    -d '{
      "fullName": "Updated Admin Name"
    }'
  ```

### Toggle User Status
- **Endpoint:** `PATCH /api/settings/users/:id/status`
- **Security:** `Bearer Token` (Requires `SUPER_ADMIN` role)
- **cURL Example:**
  ```bash
  curl -X PATCH http://localhost:3000/api/settings/users/2/status \
    -H "Authorization: Bearer <accessToken>" \
    -H "Content-Type: application/json" \
    -d '{
      "isActive": false
    }'
  ```

---

## 📁 8. Export Data

### Export Loans
- **Endpoint:** `GET /api/export/loans`
- **Security:** `Bearer Token` (Requires `export_data` permission)
- **cURL Example:**
  ```bash
  curl -X GET "http://localhost:3000/api/export/loans?format=csv&status=ACTIVE" \
    -H "Authorization: Bearer <accessToken>" \
    -o loans.csv
  ```

---

## 🕵️ 9. Audit Logs

### View Audit Logs
- **Endpoint:** `GET /api/audit-logs`
- **Security:** `Bearer Token` (Requires `audit_logs` permission)
- **cURL Example:**
  ```bash
  curl -X GET "http://localhost:3000/api/audit-logs?page=1&limit=25" \
    -H "Authorization: Bearer <accessToken>"
  ```

---

## 🏥 10. Health Check

### Get System Health
- **Endpoint:** `GET /api/health`
- **Security:** Public
- **cURL Example:**
  ```bash
  curl -X GET https://picks-complement-legitimate-muscle.trycloudflare.com/api/health
  ```
- **Example Response:**
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
