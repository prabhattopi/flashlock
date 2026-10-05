import { pool } from './index.js';

async function setupDatabase() {
  const client = await pool.connect();
  try {
    console.log('--- Cleaning old tables ---');
    await client.query(`
      DROP TABLE IF EXISTS orders CASCADE;
      DROP TABLE IF EXISTS payments CASCADE;
      DROP TABLE IF EXISTS inventory_units CASCADE;
      DROP TABLE IF EXISTS products CASCADE;
    `);

    console.log('--- Creating Schema ---');
    
    // 1. Products Master
    await client.query(`
      CREATE TABLE products (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(255) NOT NULL,
        price INT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 2. Inventory Units (Unit-Pool Pattern)
    await client.query(`
      CREATE TABLE inventory_units (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID REFERENCES products(id) ON DELETE CASCADE,
        status VARCHAR(50) DEFAULT 'AVAILABLE', -- 'AVAILABLE', 'SOLD'
        reserved_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX idx_inventory_lookup ON inventory_units(product_id, status);
    `);

    // 3. Payments Ledger (Idempotency Key ke sath)
    await client.query(`
      CREATE TABLE payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        idempotency_key VARCHAR(255) UNIQUE NOT NULL,
        user_id VARCHAR(255) NOT NULL,
        amount INT NOT NULL,
        status VARCHAR(50) NOT NULL, -- 'CAPTURED', 'REFUNDED'
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 4. Final Orders
    await client.query(`
      CREATE TABLE orders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR(255) NOT NULL,
        product_id UUID REFERENCES products(id),
        inventory_unit_id UUID REFERENCES inventory_units(id),
        amount INT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log('--- Seeding Single iPhone Inventory ---');
    // Product insert
    const prodRes = await client.query(`
      INSERT INTO products (title, price) 
      VALUES ('iPhone 16 Pro', 120000) 
      RETURNING id, title;
    `);
    const productId = prodRes.rows[0].id;

    // Sirf 1 unit insert karenge (Flipkart test case)
    await client.query(`
      INSERT INTO inventory_units (product_id, status) 
      VALUES ($1, 'AVAILABLE');
    `, [productId]);

    console.log(`Success! Product created: ${prodRes.rows[0].title} (ID: ${productId}) with exactly 1 unit in stock.`);
  } catch (error) {
    console.error('Database setup failed:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

setupDatabase();