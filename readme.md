# FlashLock Engine ⚡

> **High-Concurrency Flash Sale Engine & Chaos Simulator**  
> Resolving inventory race conditions, TOCTOU vulnerabilities, and payment gateway collisions using real-world architectures from **Shopify** (`FOR UPDATE SKIP LOCKED`) and **Flipkart** (Post-Payment Claim & Auto-Compensation).

---

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)

---

## 🎯 Executive Overview

During massive flash sales (such as **Flipkart Big Billion Days** or **Black Friday**), thousands of buyers attempt to purchase single-digit items in the exact same millisecond. 

Traditional e-commerce engines often fall into two traps:
1. **The TOCTOU (Time-Of-Check to Time-Of-Use) Trap 💥:** Reading stock, waiting for payment/network processing, then updating stock—causing catastrophic overselling (*e.g., selling 15 iPhones when only 1 exists*).
2. **The Lock Contention Trap 🔒:** Locking an aggregate stock counter (`SELECT ... FOR UPDATE`), which queues up thousands of DB connections, saturating database pools and causing cascading system downtime.

**FlashLock Engine** combines two battle-tested production strategies:
- 🛒 **Shopify Unit-Pool Architecture (`FOR UPDATE SKIP LOCKED`):** Converts stock from an aggregate number into discrete physical units. Winning requests lock their row; all other concurrent requests skip past locked rows instantly without queueing or blocking DB threads.
- 💸 **Flipkart Post-Payment Claim & Auto-Compensation:** Emulates Flipkart's flash sale checkout flow. If a user's transaction enters after inventory is claimed, the system initiates an immediate 100% automated refund (`₹1,20,000`) without customer support bottlenecks.
- 📡 **Real-Time Telemetry via Server-Sent Events (SSE):** Broadcasts stock updates, order confirmations, and refund telemetry to connected dashboards in real time.

---

## 🗺️ System Flowchart & Architecture Diagram

```mermaid
flowchart LR
    %% ==========================================
    %% PREMIUM COLOR PALETTES FOR SCREENSHOTS
    %% ==========================================
    classDef traffic fill:#0f172a,stroke:#38bdf8,stroke-width:2px,color:#f8fafc;
    classDef router fill:#1e1b4b,stroke:#a855f7,stroke-width:2px,color:#f8fafc;
    classDef naive fill:#450a0a,stroke:#f43f5e,stroke-width:2px,color:#fff1f2;
    classDef secure fill:#064e3b,stroke:#10b981,stroke-width:2px,color:#ecfdf5;
    classDef refund fill:#451a03,stroke:#f59e0b,stroke-width:2px,color:#fffbeb;
    classDef db fill:#172554,stroke:#3b82f6,stroke-width:2px,color:#eff6ff;
    classDef telemetry fill:#134e4a,stroke:#14b8a6,stroke-width:2px,color:#f0fdfa;

    %% ==========================================
    %% LEFT: TRAFFIC & ROUTING
    %% ==========================================
    subgraph TRAFFIC["🛒 1. TRAFFIC SURGE"]
        direction TB
        BUYERS["👥 15 Concurrent Buyers<br/>⚡ Parallel POST Requests<br/>Target: 1 iPhone in Stock"]:::traffic
        ROUTER{"🔀 API Checkout Router<br/>Mode Selection"}:::router
        BUYERS --> ROUTER
    end

    %% ==========================================
    %% TOP LANE: NAIVE TOCTOU VULNERABILITY
    %% ==========================================
    subgraph LANE_A["❌ PATH A: NAIVE CHECK-THEN-ACT (TOCTOU BUG)"]
        direction LR
        N1["🔍 1. Read Stock<br/>SELECT COUNT(*)<br/>All 15 see Stock = 1"]:::naive
        N2["⏳ 2. I/O Latency<br/>1000ms delay window<br/>Race condition opens"]:::naive
        N3["📝 3. Blind UPDATE<br/>UPDATE inventory_units<br/>No row locking"]:::naive
        N4["🚨 OVERSOLD BUG<br/>💥 15 Orders Placed!<br/>(-14 Unit Deficit)"]:::naive
        N1 --> N2 --> N3 --> N4
    end

    %% ==========================================
    %% BOTTOM LANE: FLASHLOCK PRODUCTION ENGINE
    %% ==========================================
    subgraph LANE_B["🛡️ PATH B: FLASHLOCK UNIT-POOL (SHOPIFY + FLIPKART)"]
        direction LR
        B1["🔑 1. Idempotency Guard<br/>Deduplicate retries<br/>Prevent double-charges"]:::secure
        B2["📦 2. Postgres Unit-Pool<br/>SELECT id FROM units<br/>FOR UPDATE SKIP LOCKED;"]:::db
        B3["⚡ 3. Atomic Claim<br/>Winner locks Unit #1<br/>14 skip with 0ms wait!"]:::secure
        B4["🏆 4. Order & Refund<br/>✅ 1 Order Minted (₹1.2L)<br/>💸 14 Instant Auto-Refunds"]:::refund
        B1 --> B2 --> B3 --> B4
    end

    %% ==========================================
    %% RIGHT: REAL-TIME TELEMETRY
    %% ==========================================
    subgraph TELEMETRY["📡 3. REAL-TIME TELEMETRY"]
        direction TB
        SSE["📢 SSE Broadcast Stream<br/>STOCK_UPDATE • ORDER • REFUND"]:::telemetry
        UI["🖥️ React Live Chaos Dashboard<br/>Terminal Feed • Wall Time ~312ms"]:::telemetry
        SSE --> UI
    end

    %% ==========================================
    %% CONNECTING PIPELINES
    %% ==========================================
    ROUTER -->|"❌ /api/checkout/naive"| N1
    ROUTER -->|"🛡️ /api/checkout/secure"| B1

    N4 --> SSE
    B4 --> SSE
```

---

## 🔬 In-Depth Concurrency Comparison

### 1. ⚠️ The Naive Check-Then-Act (`/api/checkout/naive`)
- **The Flow:**
  1. `SELECT COUNT(*) FROM inventory_units WHERE status = 'AVAILABLE'`
  2. Simulate network / gateway latency (`1000ms delay`).
  3. `UPDATE inventory_units SET status = 'SOLD'`
  4. `INSERT INTO orders`
- **The Failure (TOCTOU):** 
  Because there is no row-level or table lock between the read and write operations, all 15 concurrent requests read `available = 1` simultaneously. When the wait expires, all 15 execute their write queries.
- **The Result:** 
  **15 orders created for 1 item in stock** (`Oversold Bug`). The retailer is now liable for 14 phantom items.

---

### 2. 🛡️ The Shopify Unit-Pool Model (`/api/checkout/secure`)
- **Discrete Unit Rows:** Instead of maintaining a single aggregate integer counter (`stock = 1`), inventory is stored as discrete reservation units in `inventory_units`.
- **The Core Query:**
  ```sql
  SELECT id FROM inventory_units 
  WHERE product_id = :productId AND status = 'AVAILABLE' 
  LIMIT 1 
  FOR UPDATE SKIP LOCKED;
  ```
- **Three Guarantees:**
  1. **Zero Lock Contention ⚡:** When Buyer #1 locks Unit `A`, PostgreSQL silently **skips** that row for Buyers #2 through #15 rather than making them wait for the transaction to finish. DB threads never queue or freeze.
  2. **Instant Fail-Fast 🚀:** Losing requests receive an empty result set (`rows.length === 0`) in sub-millisecond time.
  3. **Strict ACID Atomicity 🔒:** Guaranteed mathematically that exactly 1 order can be minted per physical row.

---

### 3. 💸 The Flipkart Post-Payment & Auto-Refund Flow
In massive flash sales, customer payments or authorization holds often complete before the final inventory claim is reconciled. 

If a buyer's request executes after another buyer claimed the last available unit:
1. The database transaction immediately logs a record in the `payments` table with `status = 'REFUNDED'`.
2. A compensation payload (`₹1,20,000 refund initiated`) is dispatched.
3. An SSE event `REFUND_ISSUED` is broadcast to notify the customer in real time.
4. HTTP `409 Conflict` is returned gracefully with an explanation, preventing customer support tickets.

---

### 4. 🔑 Idempotency Guard
To protect against double charges from client retries or network disconnects:
- Every request carries an `idempotencyKey` (`req_secure_buyer_1_1728...`).
- The engine checks `payments` for existing keys before entering the claim phase:
  ```sql
  SELECT * FROM payments WHERE idempotency_key = $1;
  ```
- Any retry is recognized and returned safely without re-attempting unit claims or charging twice.

---

## 📊 Feature Comparison Matrix

| Metric / Behavior | ⚠️ Naive Check-Then-Act | 🛡️ FlashLock Unit-Pool (`SKIP LOCKED`) |
| :--- | :--- | :--- |
| **Concurrency Mechanism** | Read-then-write (Unsynchronized) | Discrete Unit Rows + `FOR UPDATE SKIP LOCKED` |
| **Lock Contention** | None (Leads to data race) | **0 ms** (Postgres skips locked rows instantly) |
| **DB Connection Pool Impact** | Vulnerable to stampedes | Safe; no blocking connection threads |
| **Overselling Vulnerability** | ❌ **High** (Created 15 orders for 1 unit) | 🛡️ **Zero** (Strictly 1 order per unit) |
| **Losing Buyer Handling** | Unhandled / Phantom Orders | 💸 **100% Instant Auto-Refund Pipeline** |
| **Retry / Double-Click Safety**| Vulnerable to duplicate billing | 🔑 **Guaranteed Idempotency Key check** |
| **Real-Time Client Feedback** | Manual polling | 📡 **Instant Server-Sent Events (SSE)** |

---

## 🗄️ Database Schema

The database utilizes PostgreSQL with relational foreign keys and indices for high-speed unit discovery:

```sql
-- 1. Product Catalog
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  price INT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 2. Discrete Unit-Pool (Shopify Pattern)
CREATE TABLE inventory_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'AVAILABLE', -- 'AVAILABLE', 'SOLD'
  reserved_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_inventory_lookup ON inventory_units(product_id, status);

-- 3. Idempotent Payments Ledger
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key VARCHAR(255) UNIQUE NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  amount INT NOT NULL,
  status VARCHAR(50) NOT NULL, -- 'CAPTURED', 'REFUNDED'
  created_at TIMESTAMP DEFAULT NOW()
);

-- 4. Confirmed Orders
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  product_id UUID REFERENCES products(id),
  inventory_unit_id UUID REFERENCES inventory_units(id),
  amount INT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 💻 Tech Stack

- **Database:** PostgreSQL (Neon Serverless, Unit-Pool data model, `SKIP LOCKED` primitives)
- **Backend:** Node.js, Express, TypeScript, `pg` Connection Pool
- **Event Streaming:** Server-Sent Events (SSE) via `EventSource`
- **Frontend Dashboard:** React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons

---

## 📁 Repository Structure

```text
flashlock/
├── backend/
│   ├── src/
│   │   ├── db/
│   │   │   ├── index.ts              # pg Pool configuration
│   │   │   └── setup.ts              # DDL Schema migration & initial seed
│   │   ├── index.ts                  # Express REST API & SSE Broadcast
│   │   └── test-concurrency.ts       # Automated CLI concurrency test script
│   ├── .env.example                  # Environment configuration template
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx                   # Interactive Chaos Simulator UI
│   │   ├── index.css                 # Tailwind CSS v4 styling
│   │   └── main.tsx                  # React Entry point
│   ├── package.json
│   └── vite.config.ts
├── .gitignore                        # Root git ignore
└── readme.md                         # Project documentation
```

---

## 🚀 Getting Started Locally

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- A PostgreSQL database URL (e.g. [Neon](https://neon.tech/) or local PostgreSQL)

---

### 1. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
# Edit .env with your PostgreSQL connection string:
# DATABASE_URL="postgresql://user:password@host/database?sslmode=require"

# Initialize database schema & seed 1 iPhone unit
npm run db:setup

# Start backend dev server (Port 5000)
npm run dev
```

---

### 2. Frontend Setup

```bash
# Open a new terminal and navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start Vite dev server (Port 5173)
npm run dev
```

Open **`http://localhost:5173`** in your browser to interact with the Chaos Simulator.

---

### 3. Automated CLI Concurrency Test

You can also run an automated stress test from the command line to simulate 15 parallel buyers against both modes:

```bash
cd backend
npm run test:concurrency
```

**Sample Output:**
```text
==============================================
🚀 Starting Test: [NAIVE] with 15 concurrent requests
==============================================
⏱️ Duration: 1042ms
💾 Real Database State:
   - Actual Orders created in DB: 15
❌ VULNERABILITY CONFIRMED: 1 iPhone in stock, but 15 orders created!

==============================================
🚀 Starting Test: [SECURE] with 15 concurrent requests
==============================================
⏱️ Duration: 312ms
📊 HTTP Responses:
   - Successful (HTTP 200): 1
   - Auto-Refunded (HTTP 409): 14
💾 Real Database State:
   - Actual Orders created in DB: 1
✅ CONCURRENCY HANDLED PERFECTLY: Exactly 1 order created, remaining 14 requests gracefully auto-refunded without locks!
```

---

## 📜 License

MIT © 2026 FlashLock Engineering Team