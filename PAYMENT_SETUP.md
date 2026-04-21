# Payment System Setup Guide - Razorpay Integration

This document explains how to set up and configure the Razorpay payment system for course enrollment in HR KURAL.

## Overview

The payment system charges **₹1 (1 rupee)** per course enrollment. Users go through the following flow:

1. Click "Enroll Now" on a course
2. Payment gateway opens (Razorpay Checkout)
3. User completes payment
4. OTP verification email is sent
5. User enters OTP to complete enrollment

## Prerequisites

1. **Razorpay Account** - Create one at https://razorpay.com
2. **Node.js and npm** - Already installed in your project
3. **Environment variables** - Set up in `.env` file

## Setup Steps

### Step 1: Create Razorpay Account

1. Go to https://razorpay.com
2. Sign up for a merchant account
3. Complete KYC verification
4. Navigate to Settings → API Keys
5. Copy your **Key ID** and **Key Secret** (keep them safe!)

### Step 2: Install Dependencies

The `razorpay` npm package has already been added to `package.json`. Install it:

```bash
cd server
npm install
```

### Step 3: Configure Environment Variables

Create or update your `.env` file in the `server` directory with:

```env
# Existing variables (keep these)
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=hrkural
JWT_SECRET=your_jwt_secret_key

# New Razorpay variables
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
```

**IMPORTANT:**

- Never commit `.env` files to version control
- Keep `RAZORPAY_KEY_SECRET` private (only for server-side use)
- `RAZORPAY_KEY_ID` is public (used in frontend)

### Step 4: Start the Server

```bash
npm start
# or for development with auto-reload
npm run dev
```

## How It Works

### Frontend Flow

1. User clicks "Enroll Now"
2. Frontend calls `/api/courses/initiate-payment`
3. Server creates a Razorpay order and returns `ORDER_ID`
4. Razorpay Checkout modal opens with payment form
5. User enters card/UPI/wallet details
6. On successful payment, frontend receives:
   - `razorpay_order_id`
   - `razorpay_payment_id`
   - `razorpay_signature`

### Backend Verification

1. Frontend calls `/api/courses/verify-payment` with payment details
2. Server verifies the Razorpay signature using the secret key
3. Server confirms payment status with Razorpay API
4. Server sends OTP to user's email
5. User enters OTP to complete enrollment

### Database Updates

When enrollment is verified, the user's `enrolled_courses` field is updated with:

```json
{
  "courseId": 1,
  "enrolledAt": "2026-03-30T10:30:00.000Z",
  "paymentId": "pay_xxxxxxxxxxxxx"
}
```

## API Endpoints

### 1. Initiate Payment

**Endpoint:** `POST /api/courses/initiate-payment`

**Headers:**

```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Body:**

```json
{
  "courseIds": [1, 2]
}
```

**Response:**

```json
{
  "orderId": "order_xxxxxxx",
  "amount": 200,
  "currency": "INR",
  "userEmail": "user@example.com",
  "userName": "John Doe",
  "courseIds": [1, 2]
}
```

### 2. Verify Payment

**Endpoint:** `POST /api/courses/verify-payment`

**Headers:**

```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Body:**

```json
{
  "orderId": "order_xxxxxxx",
  "paymentId": "pay_xxxxxxx",
  "signature": "xxxxxxxxxxxxx",
  "courseIds": [1, 2]
}
```

**Response:**

```json
{
  "message": "Payment verified! OTP sent to your email.",
  "paymentId": "pay_xxxxxxx"
}
```

### 3. Verify Enrollment with Payment

**Endpoint:** `POST /api/courses/verify-enroll-payment`

**Headers:**

```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Body:**

```json
{
  "otp": "123456",
  "paymentId": "pay_xxxxxxx"
}
```

**Response:**

```json
{
  "message": "Enrollment successful! Payment received.",
  "enrolledCourses": [
    {
      "courseId": 1,
      "enrolledAt": "2026-03-30T10:30:00.000Z",
      "paymentId": "pay_xxxxxxx"
    }
  ]
}
```

## Payment Amounts

Currently set to **₹1 per course**. To change:

### Backend (server/routes/courses.js)

Find this line in `initiate-payment`:

```javascript
const amount = courseCount * 1; // Rs.1 per course
```

Change `1` to your desired amount (e.g., `99` for ₹99).

## Testing

### Test Mode

Razorpay provides test keys:

1. Use **Test Key ID** and **Test Key Secret** in `.env`
2. Payment won't actually deduct money
3. Use test card numbers:
   - **Visa:** 4111 1111 1111 1111
   - **Mastercard:** 5555 5555 5555 4444
   - **CVV:** Any 3 digits
   - **Expiry:** Any future date

### Webhook Verification

For production, consider implementing webhooks to handle:

- Failed payments
- Refunds
- Disputed payments

See Razorpay docs: https://razorpay.com/docs/webhooks/

## Troubleshooting

### "Razorpay Key ID not configured"

- Make sure `.env` has `RAZORPAY_KEY_ID` set
- Restart the server after updating `.env`

### "Invalid payment signature"

- Verify `RAZORPAY_KEY_SECRET` is correct
- Check that request includes all three fields: orderId, paymentId, signature

### Checkout doesn't open

- Ensure Razorpay script is loaded: Check browser console for errors
- Verify `RAZORPAY_KEY_ID` is being fetched from `/api/courses/razorpay-key`

### Payment successful but enrollment not created

- Check OTP is being sent to email (verify nodemailer config)
- Check server logs for errors in `/api/courses/verify-payment`
- Verify user's email is correct

## Security Notes

1. **Key Secret Safety:**
   - Never expose `RAZORPAY_KEY_SECRET` to frontend
   - Only use it on server for signature verification
   - The endpoint `/api/courses/razorpay-key` only exposes the public `RAZORPAY_KEY_ID`

2. **Signature Verification:**
   - Always verify Razorpay signature before trusting payment
   - This prevents payment fraud

3. **OTP Verification:**
   - OTP must be verified before assuming payment is successful
   - Prevents unauthorized enrollment

## Production Checklist

- [ ] Verify all `.env` variables are set correctly
- [ ] Use production Razorpay keys (not test keys)
- [ ] Test full enrollment flow with real payment
- [ ] Verify emails are being sent for OTP
- [ ] Set up error logging/monitoring
- [ ] Backup database before going live
- [ ] Consider implementing payment webhooks for refunds
- [ ] Test refund process if applicable
- [ ] Document payment flow for support team

## File Structure

```
server/
├── routes/
│   └── courses.js (modified with payment endpoints)
├── utils/
│   ├── payment.js (new - payment helper functions)
│   └── otp.js (existing - OTP utilities)
├── package.json (modified - added razorpay)
└── .env (new - configuration)

index.html (modified - added Razorpay SDK script)
script.js (modified - updated enrollment flow)
```

## Support

For issues or questions:

1. Check Razorpay documentation: https://razorpay.com/docs
2. Review error messages in server logs
3. Verify `.env` configuration
4. Test with Razorpay test keys first

---

**Last Updated:** March 30, 2026
**Version:** 1.0
