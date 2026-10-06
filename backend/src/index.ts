import express, { Request, Response } from 'express';
import cors from 'cors';
import { pool } from './db/index.js';

const app = express();
app.use(cors());
app.use(express.json());

// SSE Clients Registry
const sseClients = new Set<Response>();

// 1. SSE Stream Route
app.get('/api/events', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

export const broadcastEvent = (event: string, payload: any) => {
  const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  sseClients.forEach((client) => client.write(data));
};

// 2. Fetch Product & Current Stock
app.get('/api/product', async (req: Request, res: Response) => {
  try {
    const prodRes = await pool.query('SELECT * FROM products LIMIT 1');
    if (prodRes.rows.length === 0) {
      return res.status(404).json({ error: 'No product found' });
    }
    const product = prodRes.rows[0];

    const stockRes = await pool.query(
      "SELECT COUNT(*) FROM inventory_units WHERE product_id = $1 AND status = 'AVAILABLE'",
      [product.id]
    );

    res.json({
      product,
      availableStock: parseInt(stockRes.rows[0].count, 10),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Reset DB for repeatable testing
app.post('/api/reset', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM orders');
    await client.query('DELETE FROM payments');
    await client.query("UPDATE inventory_units SET status = 'AVAILABLE', reserved_by = NULL");
    await client.query('COMMIT');

    broadcastEvent('STOCK_UPDATE', { availableStock: 1 });
    res.json({ success: true, message: 'Stock reset to 1 AVAILABLE item' });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});
// 4. Naive Endpoint (Fixed: 1000ms delay to simulate real checkout race window)
app.post('/api/checkout/naive', async (req: Request, res: Response) => {
  const { productId, userId } = req.body;
  const client = await pool.connect();

  try {
    // Step A: Check stock
    const stockRes = await client.query(
      "SELECT COUNT(*) FROM inventory_units WHERE product_id = $1 AND status = 'AVAILABLE'",
      [productId]
    );
    const available = parseInt(stockRes.rows[0].count, 10);

    if (available > 0) {
      // 1000ms delay: ensures all remote DB connections connect and enter race window
      await new Promise((r) => setTimeout(r, 1000));

      // Step B: Vulnerable Check-Then-Act update without row locks
      await client.query(
        "UPDATE inventory_units SET status = 'SOLD', reserved_by = $1 WHERE product_id = $2 AND status = 'AVAILABLE'",
        [userId, productId]
      );

      // Order created regardless of whether update actually claimed a unit
      await client.query(
        'INSERT INTO orders (user_id, product_id, amount) VALUES ($1, $2, 120000)',
        [userId, productId]
      );

      broadcastEvent('ORDER_PLACED', { type: 'NAIVE_SUCCESS', userId });
      broadcastEvent('STOCK_UPDATE', { availableStock: 0 });

      return res.json({ success: true, message: 'Order Placed (Naive)' });
    }

    return res.status(409).json({ success: false, message: 'Out of stock' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// 5. Production Endpoint (Shopify SKIP LOCKED + Instant Auto-Refund)
app.post('/api/checkout/secure', async (req: Request, res: Response) => {
  const { productId, userId, idempotencyKey } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Idempotency Check (Duplicate request guard)
    const existingPayment = await client.query(
      'SELECT * FROM payments WHERE idempotency_key = $1',
      [idempotencyKey]
    );

    if (existingPayment.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.json({
        success: true,
        message: 'Duplicate request ignored (Idempotent response)',
      });
    }

    // 2. Unit-Pool Claim with FOR UPDATE SKIP LOCKED
    const claimQuery = `
      SELECT id FROM inventory_units 
      WHERE product_id = $1 AND status = 'AVAILABLE' 
      LIMIT 1 
      FOR UPDATE SKIP LOCKED;
    `;
    const unitResult = await client.query(claimQuery, [productId]);

    // Stock khatam! Auto-Refund Path (Flipkart scenario)
    if (unitResult.rows.length === 0) {
      await client.query(
        "INSERT INTO payments (idempotency_key, user_id, amount, status) VALUES ($1, $2, 120000, 'REFUNDED')",
        [idempotencyKey, userId]
      );
      await client.query('COMMIT');

      broadcastEvent('REFUND_ISSUED', { userId, reason: 'OUT_OF_STOCK' });

      return res.status(409).json({
        success: false,
        status: 'REFUNDED',
        message: 'Product claimed by another user! ₹1,20,000 refund initiated.',
      });
    }

    // Success Path: Exact unit claimed
    const unitId = unitResult.rows[0].id;

    await client.query(
      "UPDATE inventory_units SET status = 'SOLD', reserved_by = $1 WHERE id = $2",
      [userId, unitId]
    );

    await client.query(
      "INSERT INTO payments (idempotency_key, user_id, amount, status) VALUES ($1, $2, 120000, 'CAPTURED')",
      [idempotencyKey, userId]
    );

    const orderRes = await client.query(
      'INSERT INTO orders (user_id, product_id, inventory_unit_id, amount) VALUES ($1, $2, $3, 120000) RETURNING id',
      [userId, productId, unitId]
    );

    await client.query('COMMIT');

    broadcastEvent('STOCK_UPDATE', { availableStock: 0 });

    return res.json({
      success: true,
      status: 'ORDER_PLACED',
      orderId: orderRes.rows[0].id,
      unitId,
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});