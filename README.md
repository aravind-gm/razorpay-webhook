# Razorpay Webhook Service

Isolated webhook processor for Razorpay payments. Runs on a public server to receive webhooks while your backend stays local.

## Architecture

```
Frontend (React) 
  ↓
Your Backend (Port 5000, Docker, LOCAL) 
  ├─ Creates orders
  ├─ Initiates payments
  └─ Polls for status

Razorpay (Cloud)
  ↓
This Webhook Service (Port 3001, PUBLIC - Render/Railway)
  └─ Receives webhooks
  └─ Updates DB
  └─ Confirms orders
```

## Setup Instructions

### 1. Local Development Setup

```bash
# Install dependencies
npm install

# Setup environment
# Copy .env.example to .env and fill in:
# - DATABASE_URL (must match your backend's database)
# - RAZORPAY_WEBHOOK_SECRET (from Razorpay dashboard)

# Build TypeScript
npm run build

# Start the service
npm start
```

### 2. Build and Deploy to Render.com

#### Step A: Push to GitHub

```bash
git init
git add .
git commit -m "Initial webhook service"
git remote add origin https://github.com/YOUR-USERNAME/razorpay-webhook.git
git push -u origin main
```

#### Step B: Create on Render

1. Go to [render.com](https://render.com)
2. Click **New** → **Web Service**
3. Connect your GitHub repo
4. Configure:
   - **Name:** `razorpay-webhook`
   - **Environment:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `node dist/index.js`
   - **Plan:** Starter

#### Step C: Set Environment Variables

In Render Dashboard → **Environment**:

```
DATABASE_URL=postgresql://user:password@host:port/dbname
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret_from_razorpay
PORT=3001
NODE_ENV=production
```

#### Step D: Get Your Public URL

Render assigns: `https://razorpay-webhook.onrender.com`

Your webhook endpoint: `https://razorpay-webhook.onrender.com/webhook/razorpay`

### 3. Register Webhook in Razorpay Dashboard

1. Go to Razorpay Dashboard → **Settings** → **Webhooks**
2. Click **Add New Webhook**
3. **URL:** `https://razorpay-webhook.onrender.com/webhook/razorpay`
4. **Secret:** Match your `RAZORPAY_WEBHOOK_SECRET` env var
5. **Events:** Select:
   - `payment.captured`
   - `payment.failed`
   - `payment.authorized`
6. **Active:** ✓ Enable

## API Endpoints

### GET `/health`
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-14T10:30:45Z"
}
```

### POST `/webhook/razorpay`
Receives Razorpay webhook events. Verifies `x-razorpay-signature` header and processes:

- `payment.captured` → Updates Payment to CONFIRMED, Order to PROCESSING
- `payment.failed` → Updates Payment to FAILED
- `payment.authorized` → Logged only

**Security:**
- Signature verification is mandatory
- Idempotent: Safe to replay same webhook
- Returns 200 on success or error (prevents Razorpay retries for processing errors)

## Database Schema

Uses the same Prisma schema as your backend. Requires:

- `Payment` table: `id`, `status`, `transactionId`, `gatewayResponse`
- `Order` table: `id`, `status`, `paymentStatus`

## Key Features

✓ **Production-safe:** Signature verification, transaction support, request IDs
✓ **Idempotent:** Safe against duplicate webhooks
✓ **Logging:** Detailed request tracking with UUIDs
✓ **Error handling:** Returns 200 even on errors (prevents infinite retries)
✓ **Shared DB:** Uses your backend's PostgreSQL database

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Empty body" | Check Razorpay is sending request body |
| "Signature mismatch" | Verify `RAZORPAY_WEBHOOK_SECRET` matches dashboard |
| Database not updating | Verify `DATABASE_URL` is correct and accessible |
| 500 errors | Check logs in Render dashboard |
| Payment not found | Verify Payment record has correct `transactionId` |

## Logs

Watch logs in Render dashboard under **Logs** tab. Look for:

```
✓ Signature verified
✓ Transaction successful
ⓘ Payment already confirmed (idempotent)
```

## Testing Locally with Ngrok (Development Only)

If you need to test webhooks locally:

```bash
# Install ngrok
npm install -g ngrok

# Start your local service
npm start

# In another terminal, expose it
ngrok http 3001

# Use the ngrok URL in Razorpay dashboard (temporary)
# ngrok assigns: https://xxxxx-xx-xxx-xxxx.ngrok.io/webhook/razorpay
```

**Note:** For production, always deploy to Render/Railway. Never use ngrok permanently.

## Security Best Practices

1. ✓ Never log sensitive data (payment IDs are OK, secrets are NOT)
2. ✓ Always verify x-razorpay-signature
3. ✓ Use HTTPS only (Render/Railway enforces this)
4. ✓ Rotate webhook secrets periodically
5. ✓ Monitor logs for suspicious activity

## Support

For Razorpay webhook events, refer to:
https://razorpay.com/docs/webhooks/

For payment states diagram, see PAYMENT_FLOW_DIAGRAM.md in main backend.
