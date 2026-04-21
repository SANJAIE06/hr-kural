const Razorpay = require("razorpay");

// Initialize Razorpay with credentials from .env
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/**
 * Create a Razorpay order for course enrollment
 * @param {number} amount - Amount in paise (1 rupee = 100 paise, so for Rs.1 = 100 paise)
 * @param {string} Currency - Currency code (default: INR)
 * @param {object} notes - Additional notes/metadata
 * @returns {Promise<object>} - Razorpay order details
 */
async function createPaymentOrder(amount, currency = "INR", notes = {}) {
  try {
    const order = await razorpay.orders.create({
      amount: amount * 100, // Convert to paise
      currency: currency,
      notes: notes,
      receipt: `receipt_${Date.now()}`,
    });

    return {
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
    };
  } catch (error) {
    console.error("Error creating Razorpay order:", error);
    return {
      success: false,
      error: error.message || "Failed to create payment order",
    };
  }
}

/**
 * Verify Razorpay payment signature
 * @param {object} paymentData - Payment response from Razorpay
 * @returns {boolean} - True if signature is valid
 */
function verifyPaymentSignature(paymentData) {
  const crypto = require("crypto");

  const { orderId, paymentId, signature } = paymentData;

  if (!orderId || !paymentId || !signature) {
    return false;
  }

  try {
    const hmac = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET);
    hmac.update(`${orderId}|${paymentId}`);
    const generatedSignature = hmac.digest("hex");

    return generatedSignature === signature;
  } catch (error) {
    console.error("Error verifying signature:", error);
    return false;
  }
}

/**
 * Fetch payment details from Razorpay
 * @param {string} paymentId - Razorpay payment ID
 * @returns {Promise<object>} - Payment details
 */
async function getPaymentDetails(paymentId) {
  try {
    const payment = await razorpay.payments.fetch(paymentId);
    return {
      success: true,
      paymentId: payment.id,
      status: payment.status,
      amount: payment.amount,
      orderId: payment.order_id,
      email: payment.email,
      method: payment.method,
    };
  } catch (error) {
    console.error("Error fetching payment details:", error);
    return {
      success: false,
      error: error.message || "Failed to fetch payment details",
    };
  }
}

module.exports = {
  createPaymentOrder,
  verifyPaymentSignature,
  getPaymentDetails,
  razorpay,
};
