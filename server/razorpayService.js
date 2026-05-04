import Razorpay from 'razorpay';
import crypto from 'crypto';

const razorpayKeyId = String(process.env.RAZORPAY_KEY_ID || '').trim();
const razorpayKeySecret = String(process.env.RAZORPAY_KEY_SECRET || '').trim();

let razorpayInstance = null;

/**
 * Initialize Razorpay instance
 */
export function initializeRazorpay() {
  if (!razorpayKeyId || !razorpayKeySecret) {
    throw new Error('Razorpay credentials not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
  }
  razorpayInstance = new Razorpay({
    key_id: razorpayKeyId,
    key_secret: razorpayKeySecret,
  });
  return razorpayInstance;
}

/**
 * Get Razorpay instance
 */
export function getRazorpayInstance() {
  if (!razorpayInstance) {
    initializeRazorpay();
  }
  return razorpayInstance;
}

/**
 * Create a Razorpay order
 * @param {Object} options - Order options
 * @param {number} options.amount - Amount in paise (INR)
 * @param {string} options.planType - Plan type (PAYG_WALLET or MEMBERSHIP)
 * @param {string} options.userId - User ID (optional, for future enhancements)
 * @returns {Promise<Object>} Order details
 */
export async function createRazorpayOrder(options) {
  const { amount, planType, userId } = options;

  if (!amount || amount <= 0) {
    throw new Error('Invalid amount');
  }

  if (!planType) {
    throw new Error('Invalid plan type');
  }

  const rzpInstance = getRazorpayInstance();

  try {
    const order = await rzpInstance.orders.create({
      amount, // Amount in paise
      currency: 'INR',
      receipt: `receipt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      description: getPlanDescription(planType),
      notes: {
        planType,
        userId: userId || 'guest',
      },
    });

    return order;
  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    throw new Error(`Failed to create payment order: ${error.message}`);
  }
}

/**
 * Verify payment signature
 * @param {Object} options - Payment details
 * @param {string} options.razorpayOrderId - Razorpay Order ID
 * @param {string} options.razorpayPaymentId - Razorpay Payment ID
 * @param {string} options.razorpaySignature - Payment signature
 * @returns {boolean} Whether signature is valid
 */
export function verifyPaymentSignature(options) {
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = options;

  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    return false;
  }

  const body = `${razorpayOrderId}|${razorpayPaymentId}`;
  const expectedSignature = crypto
    .createHmac('sha256', razorpayKeySecret)
    .update(body)
    .digest('hex');

  return expectedSignature === razorpaySignature;
}

/**
 * Capture payment
 * @param {string} paymentId - Razorpay Payment ID
 * @param {number} amount - Amount in paise
 * @returns {Promise<Object>} Captured payment details
 */
export async function capturePayment(paymentId, amount) {
  const rzpInstance = getRazorpayInstance();

  try {
    const payment = await rzpInstance.payments.capture(paymentId, amount);
    return payment;
  } catch (error) {
    console.error('Error capturing payment:', error);
    throw new Error(`Failed to capture payment: ${error.message}`);
  }
}

/**
 * Get plan description based on plan type
 */
function getPlanDescription(planType) {
  const descriptions = {
    PAYG_WALLET: 'ClauseIQ PAYG Wallet - INR 99 minimum top-up',
    MEMBERSHIP: 'ClauseIQ Light Membership - INR 99/month',
  };
  return descriptions[planType] || 'ClauseIQ Payment';
}

/**
 * Get payment details
 * @param {string} paymentId - Razorpay Payment ID
 * @returns {Promise<Object>} Payment details
 */
export async function getPaymentDetails(paymentId) {
  const rzpInstance = getRazorpayInstance();

  try {
    const payment = await rzpInstance.payments.fetch(paymentId);
    return payment;
  } catch (error) {
    console.error('Error fetching payment details:', error);
    throw new Error(`Failed to fetch payment details: ${error.message}`);
  }
}
