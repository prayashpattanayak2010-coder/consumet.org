const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

// Initialize Firebase Admin SDK safely
if (!getApps().length) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      initializeApp({ credential: cert(serviceAccount) });
    }
  } catch (err) {
    console.error('Firebase initialization warning:', err.message);
  }
}

module.exports = async (req, res) => {
  // Allow only POST requests from FamGateway
  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', message: 'Method Not Allowed' });
  }

  try {
    const payload = req.body || {};
    console.log('FamGateway Webhook Received:', JSON.stringify(payload));

    // FamGateway sends status, amount, and order_id/client_txn_id
    const status = payload.status || payload.txn_status || '';
    const amountRaw = payload.amount || payload.txn_amount || 0;
    const orderId = payload.order_id || payload.client_txn_id || payload.remark || '';
    const utr = payload.utr || payload.bank_ref_num || 'N/A';

    const isSuccess =
      status.toUpperCase() === 'SUCCESS' ||
      status.toUpperCase() === 'PAID' ||
      status.toUpperCase() === 'COMPLETED';

    if (isSuccess && orderId) {
      const userId = orderId.trim();
      const amount = parseFloat(amountRaw);

      // Determine VIP duration based on your 3 pricing plans
      let daysToAdd = 30; // Default: 1 Month (₹29)
      let planName = '1 Month Pass';

      if (amount >= 190) {
        daysToAdd = 365;  // 1 Year (₹199)
        planName = '1 Year Pass';
      } else if (amount >= 65) {
        daysToAdd = 90;   // 3 Months (₹69)
        planName = '3 Months Pass';
      }

      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + daysToAdd);

      // 1. Update via Firebase Admin SDK if configured
      if (getApps().length) {
        const db = getFirestore();
        await db.collection('users').doc(userId).set({
          isVip: true,
          vipPlan: planName,
          vipExpiry: Timestamp.fromDate(expiryDate),
          lastPayment: {
            amount: amount,
            utr: utr,
            date: Timestamp.now()
          }
        }, { merge: true });
      }

      console.log(`✅ VIP Activated: ${planName} for User ID: ${userId}`);
      return res.status(200).json({ status: 'success', message: `${planName} Activated` });
    }

    return res.status(400).json({ status: 'ignored', message: 'Pending or invalid transaction' });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return res.status(500).json({ status: 'error', message: error.message });
  }
};
    
