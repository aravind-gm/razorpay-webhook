# WEBHOOK SERVICE DEPLOYMENT CHECKLIST

## 📋 Pre-Deployment Checklist

### ✓ Local Setup Complete
- [x] Created `webhook-service/` directory
- [x] Created `package.json` with dependencies
- [x] Created `tsconfig.json` for TypeScript
- [x] Created `.env` with template variables
- [x] Created `src/index.ts` - production webhook server
- [x] Created `Dockerfile` for containerization
- [x] Copied Prisma schema from backend
- [x] Removed webhook route from main backend

### ⏭️ Before Deployment

#### Step 1: Update .env (Local Development)
```bash
# webhook-service/.env
DATABASE_URL="postgresql://ora_user:ora_password@localhost:5432/ora_db"
RAZORPAY_WEBHOOK_SECRET=test_webhook_secret_local_testing
PORT=3001
NODE_ENV=development
```

#### Step 2: Install & Build Locally (Optional)
```bash
cd webhook-service
npm install
npm run build
# npm start  # This will fail without DATABASE_URL pointing to real DB
```

#### Step 3: Push to GitHub
```bash
cd webhook-service
git init
git add .
git commit -m "Initial Razorpay webhook service"
git remote add origin https://github.com/YOUR-USERNAME/razorpay-webhook.git
git branch -M main
git push -u origin main
```

---

## 🚀 Deploy to Render.com

### Step 1: Create Render Service
1. Go to [render.com](https://render.com)
2. Click **New** → **Web Service**
3. Select **Deploy from GitHub**
4. Connect your GitHub account
5. Select `razorpay-webhook` repo

### Step 2: Configure Service
- **Name:** `razorpay-webhook`
- **Environment:** `Node`
- **Build Command:** `npm install && npm run build`
- **Start Command:** `node dist/index.js`
- **Plan:** Starter (free tier is OK for webhooks)

### Step 3: Add Environment Variables
In Render dashboard → **Environment**:

```
DATABASE_URL=postgresql://ora_user:ora_password@HOST:PORT/ora_db
RAZORPAY_WEBHOOK_SECRET=test_webhook_secret_local_testing
PORT=3001
NODE_ENV=production
```

⚠️ **IMPORTANT:** DATABASE_URL must be accessible from Render servers
- If using local PostgreSQL: Use public IP, not localhost
- If using cloud DB (Supabase, AWS RDS, etc): Use connection string from dashboard

### Step 4: Deploy
- Click **Deploy** button
- Wait for build to complete (3-5 minutes)
- Check logs for: "Listening on port 3001"

### Step 5: Get Public URL
Render assigns: `https://razorpay-webhook.onrender.com`

Your webhook endpoint: **`https://razorpay-webhook.onrender.com/webhook/razorpay`**

---

## 🎯 Register Webhook in Razorpay

1. Go to [Razorpay Dashboard](https://dashboard.razorpay.com)
2. Navigate to **Settings** → **Webhooks**
3. Click **Add New Webhook**
4. Fill in:
   - **URL:** `https://razorpay-webhook.onrender.com/webhook/razorpay`
   - **Secret:** `test_webhook_secret_local_testing` (must match env var)
   - **Events to Subscribe:**
     - ✓ `payment.captured`
     - ✓ `payment.failed`
     - ✓ `payment.authorized` (optional, logged only)
5. Enable webhook (toggle **Active**)
6. Click **Create Webhook**

---

## ✅ Verify Webhook is Working

### Test 1: Health Check
```bash
curl https://razorpay-webhook.onrender.com/health

# Expected response:
# {"status":"ok","timestamp":"2024-01-14T10:30:45Z"}
```

### Test 2: Watch Logs
In Render dashboard → **Logs** tab, you should see:
```
[request-id] Webhook request received
[request-id] ✓ Signature verified
[request-id] Event type: payment.captured
[request-id] ✓ Transaction successful
```

### Test 3: Live Payment Test
1. Place order on your frontend
2. Complete payment in Razorpay checkout
3. Check webhook logs in Render dashboard
4. Verify database updated:
   ```sql
   SELECT status, payment_status FROM orders WHERE order_number = 'YOUR-ORDER-NUMBER';
   -- Expected: PROCESSING | CONFIRMED
   ```

---

## 📊 Your Updated Backend

Your backend no longer has webhook handling. It now:

1. **Creates orders** - `/api/orders/create` (unchanged)
2. **Initiates payments** - `/api/payments/create` (unchanged)
3. **Verifies signatures** - `/api/payments/verify` (unchanged)
4. **Provides polling** - `/api/payments/:orderId/status` (unchanged)

**Nothing changed in your backend except:**
- ❌ Removed: Webhook route `/api/payments/webhook`
- ❌ Removed: Webhook import from payment.controller
- ✓ Everything else stays the same

---

## 🔄 Frontend Payment Flow

```
1. User clicks "Checkout" → Creates order
2. Frontend POST /api/payments/create (your backend)
   ← Returns razorpayOrderId
3. Razorpay checkout modal opens
4. User completes payment
5. Razorpay sends webhook to WEBHOOK SERVICE
   ↓ Webhook confirms payment in database
6. Frontend POST /api/payments/verify (your backend)
   ← Returns success
7. Frontend polls GET /api/payments/:orderId/status
   ← Sees order status = PROCESSING
8. Shows "Order Confirmed"
9. Clears cart (frontend side only)
```

---

## 🛠️ Troubleshooting

| Symptom | Cause | Solution |
|---------|-------|----------|
| Build fails on Render | Prisma version mismatch | Ensure package.json has `prisma@5.8.0` |
| "Database connection error" | Wrong DATABASE_URL | Verify connection string is public-accessible |
| Webhook not triggered | Not registered in Razorpay | Check Razorpay dashboard webhooks list |
| "Signature mismatch" | Wrong webhook secret | Verify RAZORPAY_WEBHOOK_SECRET matches |
| Order not updating | Payment record not found | Check Payment.transactionId = razorpayOrderId |
| 500 errors in logs | Prisma schema mismatch | Verify schema.prisma copied from backend |

---

## 📝 Important Notes

1. **Database is SHARED:** Webhook service and backend use the same PostgreSQL
2. **No Local Testing:** Webhook can't receive events locally (Razorpay won't reach localhost)
3. **One Webhook Service:** Shared for all orders, payment events centralized
4. **Production Safe:** Signature verification, transaction support, idempotency checks
5. **No Frontend Logic:** Webhook only updates database, frontend handles UX

---

## 🔐 Security Checklist

- [ ] RAZORPAY_WEBHOOK_SECRET is strong & random
- [ ] DATABASE_URL is from production/staging DB
- [ ] Webhook URL is HTTPS only (Render enforces this)
- [ ] Razorpay dashboard webhook is marked Active
- [ ] Logs don't contain sensitive data
- [ ] Only the webhook service can confirm orders

---

**Next Steps:**
1. Push webhook-service to GitHub
2. Create Render service and deploy
3. Register webhook URL in Razorpay
4. Run a test payment
5. Watch logs and verify database updates
6. Go live with confidence! 🎉

