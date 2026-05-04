/**
 * Razorpay Payment Utility
 * Handles client-side Razorpay checkout and payment flow
 */

/**
 * Load Razorpay script dynamically
 */
export async function loadRazorpayScript() {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if (window.Razorpay) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;

    script.onload = () => {
      if (window.Razorpay) {
        resolve();
      } else {
        reject(new Error('Razorpay script loaded but Razorpay object not found'));
      }
    };

    script.onerror = () => {
      reject(new Error('Failed to load Razorpay script'));
    };

    document.body.appendChild(script);
  });
}

/**
 * Create a payment order from backend
 */
export async function createPaymentOrder(planType, amount) {
  try {
    const response = await fetch('/api/payment/create-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        planType,
        amount, // Amount in paise (INR)
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create payment order');
    }

    return await response.json();
  } catch (error) {
    console.error('Error creating payment order:', error);
    throw error;
  }
}

/**
 * Verify payment on backend
 */
export async function verifyPayment(razorpayOrderId, razorpayPaymentId, razorpaySignature, planType) {
  try {
    const response = await fetch('/api/payment/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
        planType,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Payment verification failed');
    }

    return await response.json();
  } catch (error) {
    console.error('Error verifying payment:', error);
    throw error;
  }
}

/**
 * Get plan details for payment
 */
export function getPlanDetails(planType) {
  const plans = {
    PAYG_WALLET: {
      name: 'PAYG Wallet',
      description: 'Top-up your wallet to pay for contract reviews',
      amount: 9900, // INR 99 in paise
      amountDisplay: 'INR 99',
    },
    MEMBERSHIP: {
      name: 'Light Membership',
      description: 'Monthly membership with included reviews',
      amount: 9900, // INR 99 in paise (monthly)
      amountDisplay: 'INR 99/month',
    },
  };

  return plans[planType] || null;
}

/**
 * Initiate Razorpay payment checkout
 * @param {string} planType - 'PAYG_WALLET' or 'MEMBERSHIP'
 * @param {Object} userDetails - User email and name
 * @returns {Promise<Object>} Payment result
 */
export async function initiatePayment(planType, userDetails = {}) {
  try {
    // Load Razorpay script
    await loadRazorpayScript();

    // Get plan details
    const planDetails = getPlanDetails(planType);
    if (!planDetails) {
      throw new Error('Invalid plan type');
    }

    // Create order from backend
    const orderResponse = await createPaymentOrder(planType, planDetails.amount);

    // Resolve public Razorpay key for browser (Vite uses import.meta.env)
    const razorpayPublicKey = (
      (typeof import.meta !== 'undefined' && import.meta.env && (import.meta.env.VITE_RAZORPAY_KEY_ID || import.meta.env.REACT_APP_RAZORPAY_KEY_ID))
      || (typeof process !== 'undefined' && process.env && process.env.REACT_APP_RAZORPAY_KEY_ID)
      || ''
    );

    // Check if Razorpay is available
    if (!window.Razorpay) {
      throw new Error('Razorpay is not available');
    }

    // Return a promise that settles for success, failure, and user cancellation.
    return new Promise((resolve, reject) => {
      const options = {
        key: razorpayPublicKey,
        amount: planDetails.amount, // Amount in paise
        currency: 'INR',
        name: 'ClauseIQ',
        description: planDetails.description,
        image: '/src/assets/logo.png', // Your logo URL
        order_id: orderResponse.orderId,
        customer_notify: 1,
        handler: async (response) => {
          try {
            // Verify payment on backend
            const verificationResult = await verifyPayment(
              response.razorpay_order_id,
              response.razorpay_payment_id,
              response.razorpay_signature,
              planType,
            );

            resolve(verificationResult);
          } catch (error) {
            console.error('Payment verification failed:', error);
            reject(error);
          }
        },
        prefill: {
          name: userDetails.name || '',
          email: userDetails.email || '',
        },
        notes: {
          planType,
          platform: 'clauseiq-web',
        },
        theme: {
          color: '#0b1119',
        },
        modal: {
          ondismiss: () => {
            reject(new Error('Payment cancelled by user'));
          },
        },
      };

      // Create and open checkout
      const razorpay = new window.Razorpay(options);

      razorpay.on('payment.failed', (response) => {
        console.error('Payment failed:', response.error);
        reject(new Error(`Payment failed: ${response.error.code} - ${response.error.description}`));
      });

      // Open payment modal
      razorpay.open();
    });
  } catch (error) {
    console.error('Error initiating payment:', error);
    throw error;
  }
}

/**
 * Handle plan selection and redirect to payment
 * @param {string} planType - Plan type selected
 * @param {Object} userDetails - User email and name
 * @param {Function} onSuccess - Callback on successful payment
 * @param {Function} onError - Callback on error
 */
export async function handlePlanSelection(planType, userDetails, onSuccess, onError) {
  try {
    // Skip payment for free plan
    if (planType === 'FREE') {
      if (onSuccess) {
        onSuccess({ planType, message: 'Free plan activated' });
      }
      return;
    }

    // Initiate payment for paid plans
    const result = await initiatePayment(planType, userDetails);

    if (result?.success) {
      if (onSuccess) {
        onSuccess(result);
      }
    }
  } catch (error) {
    console.error('Plan selection error:', error);
    if (onError) {
      onError(error);
    }
  }
}
