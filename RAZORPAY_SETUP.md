# Razorpay Payment Gateway Integration

This document outlines the integration of Razorpay payment gateway with ClauseIQ platform for processing paid plan purchases.

## Overview

The payment system allows users to:
- Select paid plans (PAYG Wallet and Light Membership)
- Redirect to Razorpay checkout
- Securely process payments
- Verify payment signatures for security

## Setup Instructions

### 1. Razorpay Account Setup

1. **Create a Razorpay Account**
   - Visit [Razorpay](https://razorpay.com/)
   - Sign up for a business account
   - Complete KYC verification

2. **Get API Credentials**
   - Log in to Razorpay Dashboard
   - Navigate to Settings → API Keys
   - Copy your:
     - Key ID (public key)
     - Key Secret (secret key - keep this safe!)

3. **Enable Webhooks (Optional)**
   - In Razorpay Dashboard, go to Settings → Webhooks
   - Add webhook URL: `https://your-domain/api/payment/webhook`
   - Select events: `payment.authorized`, `payment.failed`, `payment.captured`

### 2. Environment Variables

Add the following environment variables to your `.env` file:

```env
# Razorpay Configuration
RAZORPAY_KEY_ID=your_razorpay_key_id_here
RAZORPAY_KEY_SECRET=your_razorpay_key_secret_here

# Frontend Razorpay Key (Public, safe to expose)
REACT_APP_RAZORPAY_KEY_ID=your_razorpay_key_id_here
```

**Important:** 
- Keep `RAZORPAY_KEY_SECRET` private and only on the server
- `REACT_APP_RAZORPAY_KEY_ID` is public and used in the browser

### 3. Directory Structure

The integration includes the following files:

```
server/
  └─ razorpayService.js          # Backend Razorpay operations
  └─ index.js                     # Updated with payment endpoints

src/
  ├─ components/
  │  └─ LandingPage.jsx          # Updated with payment UI
  └─ utils/
     └─ razorpayClient.js        # Frontend payment utility
```

## API Endpoints

### Create Payment Order

**POST** `/api/payment/create-order`

Creates a Razorpay order for a plan purchase.

**Request Body:**
```json
{
  "planType": "PAYG_WALLET" | "MEMBERSHIP",
  "amount": 9900  // Amount in paise (INR 99)
}
```

**Response:**
```json
{
  "orderId": "order_XXXXXXXXX",
  "amount": 9900,
  "currency": "INR",
  "receipt": "receipt_unique_id",
  "createdAt": "2024-05-04T10:00:00Z"
}
```

### Verify Payment

**POST** `/api/payment/verify`

Verifies Razorpay payment signature to confirm transaction authenticity.

**Request Body:**
```json
{
  "razorpayOrderId": "order_XXXXXXXXX",
  "razorpayPaymentId": "pay_XXXXXXXXX",
  "razorpaySignature": "signature_hash",
  "planType": "PAYG_WALLET" | "MEMBERSHIP"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Payment verified successfully.",
  "paymentId": "pay_XXXXXXXXX",
  "orderId": "order_XXXXXXXXX",
  "planType": "PAYG_WALLET",
  "verifiedAt": "2024-05-04T10:00:00Z"
}
```

### Webhook Endpoint (Optional)

**POST** `/api/payment/webhook`

Receives payment events from Razorpay.

**Supported Events:**
- `payment.authorized` - Payment authorized
- `payment.failed` - Payment failed
- `payment.captured` - Payment captured

## Frontend Integration

### Using the Payment Utility

The `razorpayClient.js` provides several functions:

```javascript
import { handlePlanSelection } from '@/utils/razorpayClient.js';

// Handle plan selection with automatic payment flow
await handlePlanSelection(
  'PAYG_WALLET',  // Plan type
  { email: 'user@example.com', name: 'John Doe' },  // User details
  (result) => console.log('Payment successful:', result),  // On success
  (error) => console.error('Payment failed:', error)  // On error
);
```

### Payment Flow

1. **User clicks "Use PAYG" or "Start Membership"**
   - Frontend detects paid plan selection
   - Loads Razorpay script dynamically

2. **Create Order**
   - Backend creates Razorpay order
   - Returns order ID

3. **Open Checkout**
   - Razorpay checkout modal opens
   - User enters card details

4. **Payment Processing**
   - Razorpay processes payment
   - Returns payment ID and signature

5. **Verify Signature**
   - Frontend sends verification request
   - Backend verifies signature using secret key
   - Confirms transaction authenticity

6. **Payment Complete**
   - Success message displayed
   - User redirected to app

## Pricing Plans

### Plan Configuration

The pricing plans are defined in `LandingPage.jsx`:

```javascript
const pricingPlans = [
  {
    title: 'Free Plan',
    price: 'INR 0',
    // No payment required
  },
  {
    title: 'PAYG Wallet',
    price: 'INR 99',
    amount: 9900,  // in paise
    planType: 'PAYG_WALLET'
  },
  {
    title: 'Light Membership',
    price: 'INR 99/month',
    amount: 9900,  // in paise
    planType: 'MEMBERSHIP'
  },
];
```

**To modify plans:**
1. Edit plan details in `LandingPage.jsx`
2. Update amount to paise (multiply by 100)
3. Ensure plan type matches backend configuration

## Testing

### Test Credentials

Razorpay provides test credentials:

1. **Go to Razorpay Dashboard**
   - Settings → API Keys → Switch to "Test Mode"

2. **Test Cards**
   - **Visa:** 4111 1111 1111 1111
   - **Mastercard:** 5555 5555 5555 4444
   - **Expiry:** Any future date
   - **CVV:** Any 3-digit number

3. **Test Flow**
   - Click on a paid plan
   - Complete Razorpay checkout with test card
   - Verify payment is processed correctly

### Test Environment Variables

```env
# For testing - replace with test credentials
RAZORPAY_KEY_ID=rzp_test_XXXXXXXXXXXXX
RAZORPAY_KEY_SECRET=test_secret_XXXXXXXXXXXXX
REACT_APP_RAZORPAY_KEY_ID=rzp_test_XXXXXXXXXXXXX
```

## Security Considerations

1. **Never expose secret key in frontend**
   - Only use public key in browser
   - Keep secret key on server only

2. **Always verify signatures**
   - Server verifies Razorpay signatures
   - Prevents tampering with payment data

3. **Use HTTPS in production**
   - Encrypt all payment data in transit
   - Razorpay requires HTTPS URLs

4. **Store payment records**
   - Consider adding payment history to database
   - Track user transactions for auditing

5. **Rate limiting**
   - Implement rate limiting on payment endpoints
   - Prevent brute force attacks

## Error Handling

The integration includes error handling for:

- **Invalid plan type:** Rejects unknown plan types
- **Invalid amount:** Rejects amounts outside allowed range
- **Missing credentials:** Warns if Razorpay not configured
- **Network errors:** Handles payment gateway connectivity issues
- **Verification failures:** Rejects unverified payments

## Troubleshooting

### "Razorpay is not available"
- **Cause:** Script not loaded
- **Fix:** Check internet connection, verify Razorpay CDN accessibility

### "Payment verification failed"
- **Cause:** Invalid signature or incorrect secret key
- **Fix:** Verify API credentials in `.env` file

### "RAZORPAY_KEY_ID/SECRET not configured"
- **Cause:** Missing environment variables
- **Fix:** Add credentials to `.env` and restart server

### Test card rejected
- **Cause:** Using production credentials in test mode
- **Fix:** Switch to test mode in Razorpay dashboard

## Production Deployment

1. **Get Live Credentials**
   - Razorpay Dashboard → Settings → API Keys
   - Switch to "Live Mode"
   - Copy live Key ID and Secret

2. **Update Environment**
   - Replace test credentials with live credentials in `.env`
   - Ensure HTTPS is enabled
   - Update Razorpay webhook URLs to production domain

3. **Database Integration**
   - Add payment history collection (optional)
   - Store transaction details for records
   - Implement payment status updates

4. **Monitoring**
   - Set up alerts for failed payments
   - Monitor Razorpay webhook delivery
   - Track payment success rate

## Additional Resources

- [Razorpay Documentation](https://razorpay.com/docs/)
- [Razorpay Checkout Guide](https://razorpay.com/docs/payments/checkout/)
- [Payment Security Best Practices](https://razorpay.com/docs/payments/security/)
- [Webhook Documentation](https://razorpay.com/docs/webhooks/)

## Support

For issues with Razorpay integration:
1. Check Razorpay Dashboard for payment status
2. Review browser console for errors
3. Check server logs for API errors
4. Contact Razorpay support with transaction IDs
