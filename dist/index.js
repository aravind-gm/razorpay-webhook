"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const crypto_1 = __importDefault(require("crypto"));
const dotenv_1 = __importDefault(require("dotenv"));
const client_1 = require("@prisma/client");
dotenv_1.default.config();
const app = (0, express_1.default)();
const prisma = new client_1.PrismaClient();
const PORT = process.env.PORT || 3001;
// ============================================
// MIDDLEWARE SETUP (CRITICAL ORDER)
// ============================================
// 1. CORS - Enable cross-origin requests from Razorpay
app.use((0, cors_1.default)({
    origin: '*',
    methods: ['POST', 'GET'],
    allowedHeaders: ['Content-Type', 'x-razorpay-signature'],
}));
// 2. RAW BODY PARSER - MUST come BEFORE JSON parser
// This captures the exact bytes for signature verification
app.use(express_1.default.raw({
    type: 'application/json',
    limit: '10mb',
}));
// 3. JSON PARSER - For all other routes
app.use(express_1.default.json());
// ============================================
// HEALTH CHECK
// ============================================
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// ============================================
// RAZORPAY WEBHOOK HANDLER
// ============================================
/**
 * POST /webhook/razorpay
 *
 * Receives payment events from Razorpay
 * Verifies x-razorpay-signature header
 * Updates Order and Payment in database
 * Idempotent: Multiple identical webhooks are safe
 */
app.post('/webhook/razorpay', async (req, res) => {
    const startTime = Date.now();
    const requestId = crypto_1.default.randomUUID();
    console.log(`\n[${new Date().toISOString()}] [${requestId}] Webhook request received`);
    console.log(`[${requestId}] Headers:`, req.headers);
    try {
        // ────────────────────────────────────────────
        // STEP 1: EXTRACT RAW BODY (Buffer)
        // ────────────────────────────────────────────
        const rawBody = req.body;
        if (!rawBody || rawBody.length === 0) {
            console.error(`[${requestId}] ✗ Empty body`);
            return res.status(400).json({ error: 'Empty body' });
        }
        // ────────────────────────────────────────────
        // STEP 2: EXTRACT & VERIFY SIGNATURE
        // ────────────────────────────────────────────
        const signature = req.headers['x-razorpay-signature'];
        if (!signature) {
            console.error(`[${requestId}] ✗ Missing x-razorpay-signature header`);
            return res.status(401).json({ error: 'Unauthorized: Missing signature' });
        }
        // Signature MUST be verified using the exact raw bytes
        const bodyString = rawBody.toString('utf-8');
        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
        if (!webhookSecret) {
            console.error(`[${requestId}] ✗ RAZORPAY_WEBHOOK_SECRET not configured`);
            return res.status(500).json({ error: 'Server misconfiguration' });
        }
        const expectedSignature = crypto_1.default
            .createHmac('sha256', webhookSecret)
            .update(bodyString)
            .digest('hex');
        const signatureValid = expectedSignature === signature;
        console.log(`[${requestId}] Signature verification:`, {
            valid: signatureValid,
            received: signature.substring(0, 20) + '...',
            expected: expectedSignature.substring(0, 20) + '...',
        });
        if (!signatureValid) {
            console.error(`[${requestId}] ✗ Signature mismatch (SECURITY: Rejected)`);
            return res.status(401).json({ error: 'Unauthorized: Signature mismatch' });
        }
        console.log(`[${requestId}] ✓ Signature verified`);
        // ────────────────────────────────────────────
        // STEP 3: PARSE JSON EVENT
        // ────────────────────────────────────────────
        let event;
        try {
            event = JSON.parse(bodyString);
        }
        catch (err) {
            console.error(`[${requestId}] ✗ Invalid JSON:`, err);
            return res.status(400).json({ error: 'Invalid JSON' });
        }
        const eventType = event.event;
        console.log(`[${requestId}] Event type:`, eventType);
        // ────────────────────────────────────────────
        // STEP 4: ROUTE TO HANDLER
        // ────────────────────────────────────────────
        switch (eventType) {
            case 'payment.captured':
                return await handlePaymentCaptured(event, requestId, res);
            case 'payment.failed':
                return await handlePaymentFailed(event, requestId, res);
            case 'payment.authorized':
                // Log but don't process
                console.log(`[${requestId}] ⓘ Ignoring payment.authorized event`);
                return res.json({ received: true });
            default:
                console.log(`[${requestId}] ⓘ Unknown event type, ignoring:`, eventType);
                return res.json({ received: true });
        }
    }
    catch (error) {
        console.error(`[${requestId}] ✗ Unexpected error:`, error);
        // Always return 200 to prevent Razorpay from retrying
        return res.status(200).json({ received: true, error: 'Processing error' });
    }
});
// ────────────────────────────────────────────
// HANDLER: payment.captured
// ────────────────────────────────────────────
async function handlePaymentCaptured(event, requestId, res) {
    console.log(`[${requestId}] Processing payment.captured event`);
    try {
        const paymentEntity = event.payload?.payment?.entity;
        if (!paymentEntity) {
            console.error(`[${requestId}] ✗ Missing payment entity`);
            return res.status(200).json({ received: true });
        }
        const razorpayPaymentId = paymentEntity.id;
        const razorpayOrderId = paymentEntity.order_id;
        const amount = paymentEntity.amount; // in paise
        console.log(`[${requestId}] Payment details:`, {
            razorpayPaymentId,
            razorpayOrderId,
            amount,
        });
        // ────────────────────────────────────────────
        // FIND PAYMENT RECORD (link via transactionId)
        // ────────────────────────────────────────────
        const payment = await prisma.payment.findFirst({
            where: { transactionId: razorpayOrderId },
            include: { order: true },
        });
        if (!payment) {
            console.warn(`[${requestId}] ⚠ Payment not found for razorpayOrderId: ${razorpayOrderId}`);
            return res.json({ received: true });
        }
        // ────────────────────────────────────────────
        // IDEMPOTENCY CHECK
        // ────────────────────────────────────────────
        if (payment.status === 'CONFIRMED') {
            console.log(`[${requestId}] ⓘ Payment already confirmed (idempotent)`);
            return res.json({ received: true });
        }
        // ────────────────────────────────────────────
        // ATOMIC TRANSACTION: UPDATE PAYMENT + ORDER
        // ────────────────────────────────────────────
        console.log(`[${requestId}] Starting database transaction...`);
        const result = await prisma.$transaction(async (tx) => {
            // Update payment
            const updatedPayment = await tx.payment.update({
                where: { id: payment.id },
                data: {
                    status: 'CONFIRMED',
                    gatewayResponse: {
                        ...(typeof payment.gatewayResponse === 'object' &&
                            payment.gatewayResponse
                            ? payment.gatewayResponse
                            : {}),
                        razorpayPaymentId,
                        capturedAt: new Date().toISOString(),
                    },
                },
            });
            // Update order
            const updatedOrder = await tx.order.update({
                where: { id: payment.orderId },
                data: {
                    status: 'PROCESSING',
                    paymentStatus: 'CONFIRMED',
                },
            });
            return { payment: updatedPayment, order: updatedOrder };
        });
        console.log(`[${requestId}] ✓ Transaction successful:`, {
            paymentId: result.payment.id,
            paymentStatus: result.payment.status,
            orderNumber: result.order.orderNumber,
            orderStatus: result.order.status,
        });
        return res.json({ received: true });
    }
    catch (error) {
        console.error(`[${requestId}] ✗ Error processing payment.captured:`, error);
        return res.status(200).json({ received: true });
    }
}
// ────────────────────────────────────────────
// HANDLER: payment.failed
// ────────────────────────────────────────────
async function handlePaymentFailed(event, requestId, res) {
    console.log(`[${requestId}] Processing payment.failed event`);
    try {
        const paymentEntity = event.payload?.payment?.entity;
        if (!paymentEntity) {
            console.error(`[${requestId}] ✗ Missing payment entity`);
            return res.status(200).json({ received: true });
        }
        const razorpayOrderId = paymentEntity.order_id;
        const failureReason = paymentEntity.error_source?.error_reason || 'Unknown';
        console.log(`[${requestId}] Payment failed:`, {
            razorpayOrderId,
            failureReason,
        });
        // Find and update payment
        const payment = await prisma.payment.findFirst({
            where: { transactionId: razorpayOrderId },
        });
        if (payment && payment.status !== 'FAILED') {
            await prisma.payment.update({
                where: { id: payment.id },
                data: {
                    status: 'FAILED',
                    gatewayResponse: {
                        ...(typeof payment.gatewayResponse === 'object' &&
                            payment.gatewayResponse
                            ? payment.gatewayResponse
                            : {}),
                        failedAt: new Date().toISOString(),
                        failureReason,
                    },
                },
            });
            console.log(`[${requestId}] ✓ Payment marked as FAILED`);
        }
        return res.json({ received: true });
    }
    catch (error) {
        console.error(`[${requestId}] ✗ Error processing payment.failed:`, error);
        return res.status(200).json({ received: true });
    }
}
// ============================================
// GRACEFUL SHUTDOWN
// ============================================
process.on('SIGINT', async () => {
    console.log('\nShutting down gracefully...');
    await prisma.$disconnect();
    process.exit(0);
});
// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
    console.log(`\n════════════════════════════════════════════════════`);
    console.log(`Razorpay Webhook Service`);
    console.log(`Listening on port ${PORT}`);
    console.log(`Webhook URL: http://localhost:${PORT}/webhook/razorpay`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`════════════════════════════════════════════════════\n`);
});
