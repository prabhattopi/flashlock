import { pool } from './db/index.js';

const BASE_URL = 'http://localhost:5000/api';

async function runTest(mode: 'naive' | 'secure', concurrentUsers: number) {
  console.log(`\n==============================================`);
  console.log(`🚀 Starting Test: [${mode.toUpperCase()}] with ${concurrentUsers} concurrent requests`);
  console.log(`==============================================`);

  // 1. Reset stock to 1
  await fetch(`${BASE_URL}/reset`, { method: 'POST' });

  // 2. Get Product ID
  const prodRes = await fetch(`${BASE_URL}/product`);
  const { product } = await prodRes.json();

  console.log(`Item in stock: 1 iPhone 16 Pro`);
  console.log(`Firing ${concurrentUsers} simultaneous checkout requests...\n`);

  const startTime = Date.now();

  // 3. Firing parallel requests via Promise.all
  const promises = Array.from({ length: concurrentUsers }, (_, i) => {
    const userId = `user_${i + 1}`;
    const idempotencyKey = `req_${mode}_${userId}_${Date.now()}`;

    return fetch(`${BASE_URL}/checkout/${mode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: product.id,
        userId,
        idempotencyKey,
      }),
    }).then(async (res) => ({
      status: res.status,
      data: await res.json(),
    }));
  });

  const results = await Promise.all(promises);
  const duration = Date.now() - startTime;

  // 4. Analyze Results
  let successfulOrders = 0;
  let refundedOrders = 0;
  let failedOutofStock = 0;

  results.forEach((r) => {
    if (r.status === 200 && r.data.success) successfulOrders++;
    else if (r.data.status === 'REFUNDED') refundedOrders++;
    else failedOutofStock++;
  });

  // 5. Query Actual Database State
  const ordersCountRes = await pool.query('SELECT COUNT(*) FROM orders');
  const actualOrdersInDb = parseInt(ordersCountRes.rows[0].count, 10);

  console.log(`⏱️ Duration: ${duration}ms`);
  console.log(`📊 HTTP Responses:`);
  console.log(`   - Successful (HTTP 200): ${successfulOrders}`);
  console.log(`   - Auto-Refunded (HTTP 409): ${refundedOrders}`);
  console.log(`   - Out of Stock Direct Rejections: ${failedOutofStock}`);
  console.log(`💾 Real Database State:`);
  console.log(`   - Actual Orders created in DB: ${actualOrdersInDb}`);

  if (mode === 'naive') {
    if (actualOrdersInDb > 1) {
      console.log(`❌ VULNERABILITY CONFIRMED: 1 iPhone tha par ${actualOrdersInDb} orders ban gaye! (Screenshot 2 Bug)`);
    }
  } else {
    if (actualOrdersInDb === 1 && refundedOrders === concurrentUsers - 1) {
      console.log(`✅ CONCURRENCY HANDLED PERFECTLY: Exactly 1 order created, baki ${refundedOrders} requests gracefully auto-refunded without locks! (Flipkart Solved)`);
    } else {
      console.log(`⚠️ Unexpected DB state: Check pool or logic.`);
    }
  }
}

async function start() {
  try {
    // Test Naive first
    await runTest('naive', 15);
    // Test Secure next
    await runTest('secure', 15);
  } catch (err) {
    console.error('Test execution error:', err);
  } finally {
    await pool.end();
  }
}

start();