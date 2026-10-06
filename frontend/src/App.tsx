import { useEffect, useState } from 'react';
import { 
  Zap, 
  RotateCcw, 
  ShieldCheck, 
  AlertTriangle, 
  Smartphone, 
  Terminal,
  Activity,
  ArrowRight
} from 'lucide-react';

interface Product {
  id: string;
  title: string;
  price: number;
}

interface EventLog {
  id: string;
  timestamp: string;
  text: string;
  type: 'success' | 'refund' | 'info' | 'error';
}

const BACKEND_URL = 'http://localhost:5000/api';

export default function App() {
  const [product, setProduct] = useState<Product | null>(null);
  const [availableStock, setAvailableStock] = useState<number>(1);
  const [mode, setMode] = useState<'naive' | 'secure'>('secure');
  const [concurrencyCount, setConcurrencyCount] = useState<number>(15);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [logs, setLogs] = useState<EventLog[]>([]);
  const [metrics, setMetrics] = useState<{
    successful: number;
    refunded: number;
    rejected: number;
    duration: number;
  }>({ successful: 0, refunded: 0, rejected: 0, duration: 0 });

  const addLog = (text: string, type: 'success' | 'refund' | 'info' | 'error' = 'info') => {
    setLogs((prev) => [
      {
        id: Math.random().toString(),
        timestamp: new Date().toLocaleTimeString(),
        text,
        type,
      },
      ...prev.slice(0, 40), // Keep latest 40 logs
    ]);
  };

  // 1. Initial Product Fetch & SSE Setup
  useEffect(() => {
    fetch(`${BACKEND_URL}/product`)
      .then((res) => res.json())
      .then((data) => {
        setProduct(data.product);
        setAvailableStock(data.availableStock);
        addLog(`Product loaded: ${data.product.title} (Stock: ${data.availableStock})`, 'info');
      })
      .catch(() => addLog('Backend server not connected on port 5000', 'error'));

    // Server-Sent Events (SSE) Stream
    const eventSource = new EventSource(`${BACKEND_URL}/events`);

    eventSource.addEventListener('STOCK_UPDATE', (e) => {
      const data = JSON.parse(e.data);
      setAvailableStock(data.availableStock);
      addLog(`[SSE] Realtime Stock Broadcast: ${data.availableStock} available`, 'info');
    });

    eventSource.addEventListener('REFUND_ISSUED', (e) => {
      const data = JSON.parse(e.data);
      addLog(`[SSE AUTO-REFUND] User ${data.userId}: ₹1,20,000 returned to source account`, 'refund');
    });

    eventSource.addEventListener('ORDER_PLACED', (e) => {
      const data = JSON.parse(e.data);
      addLog(`[SSE ORDER] User ${data.userId} claimed iPhone!`, 'success');
    });

    return () => eventSource.close();
  }, []);

  // 2. Reset Database State
  const handleReset = async () => {
    try {
      await fetch(`${BACKEND_URL}/reset`, { method: 'POST' });
      setMetrics({ successful: 0, refunded: 0, rejected: 0, duration: 0 });
      setLogs([]);
      addLog('Database reset: Inventory reverted to 1 item.', 'info');
    } catch (err) {
      addLog('Reset failed', 'error');
    }
  };

  // 3. Fire Concurrent Flash Sale Simulator
  const fireChaosTest = async () => {
    if (!product || isRunning) return;
    setIsRunning(true);
    addLog(`--- Initiating ${concurrencyCount} concurrent requests via [${mode.toUpperCase()}] ---`, 'info');

    const startTime = performance.now();

    const promises = Array.from({ length: concurrencyCount }, (_, i) => {
      const userId = `buyer_${i + 1}`;
      const idempotencyKey = `req_${mode}_${userId}_${Date.now()}`;

      return fetch(`${BACKEND_URL}/checkout/${mode}`, {
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
    const duration = Math.round(performance.now() - startTime);

    let successCount = 0;
    let refundCount = 0;
    let rejectedCount = 0;

    results.forEach((r) => {
      if (r.status === 200 && r.data.success) successCount++;
      else if (r.data.status === 'REFUNDED') refundCount++;
      else rejectedCount++;
    });

    setMetrics({
      successful: successCount,
      refunded: refundCount,
      rejected: rejectedCount,
      duration,
    });

    setIsRunning(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 flex flex-col items-center">
      {/* Header */}
      <header className="w-full max-w-6xl mb-8 flex justify-between items-center border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Zap className="text-amber-400 w-6 h-6" /> FlashLock Engine
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Shopify Unit-Pool Architecture (`SKIP LOCKED`) vs Naive TOCTOU Concurrency Simulator
          </p>
        </div>
        <button
          onClick={handleReset}
          className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-3 py-2 rounded-md font-medium transition cursor-pointer border border-slate-700"
        >
          <RotateCcw className="w-4 h-4" /> Reset DB to 1 Unit
        </button>
      </header>

      <main className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Product Card & Controls */}
        <div className="lg:col-span-5 space-y-6">
          {/* Product UI */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800">
                  Live Big Billion Flash Sale
                </span>
                <h2 className="text-lg font-bold text-white mt-2 flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-indigo-400" /> {product?.title || 'Loading...'}
                </h2>
                <p className="text-xl font-mono text-emerald-400 font-bold mt-1">₹1,20,000</p>
              </div>

              {/* Stock Badge */}
              <div className="text-right">
                <span
                  className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
                    availableStock > 0
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      : 'bg-rose-950 text-rose-400 border border-rose-800'
                  }`}
                >
                  {availableStock > 0 ? `${availableStock} IN STOCK` : 'SOLD OUT'}
                </span>
              </div>
            </div>

            <div className="mt-6 border-t border-slate-800 pt-4">
              <p className="text-xs text-slate-400">
                Scenario: 2+ users enter payment gateway at the exact same second. Whoever pays first wins, late arrivals are auto-refunded without locks.
              </p>
            </div>
          </div>

          {/* Test Configuration */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Activity className="w-4 h-4 text-amber-400" /> Simulation Config
            </h3>

            {/* Mode Selector */}
            <div>
              <label className="text-xs text-slate-400 block mb-2">Checkout Concurrency Logic</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMode('naive')}
                  className={`px-3 py-2 text-xs rounded-lg font-semibold flex items-center justify-center gap-1.5 border transition cursor-pointer ${
                    mode === 'naive'
                      ? 'bg-rose-950/80 border-rose-600 text-rose-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" /> Naive (Buggy)
                </button>
                <button
                  type="button"
                  onClick={() => setMode('secure')}
                  className={`px-3 py-2 text-xs rounded-lg font-semibold flex items-center justify-center gap-1.5 border transition cursor-pointer ${
                    mode === 'secure'
                      ? 'bg-emerald-950/80 border-emerald-600 text-emerald-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" /> SKIP LOCKED (Shopify)
                </button>
              </div>
            </div>

            {/* Concurrency Slider */}
            <div>
              <div className="flex justify-between text-xs text-slate-400 mb-1">
                <span>Simultaneous Buyers</span>
                <span className="font-mono text-white font-bold">{concurrencyCount} requests</span>
              </div>
              <input
                type="range"
                min="2"
                max="20"
                value={concurrencyCount}
                onChange={(e) => setConcurrencyCount(Number(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>

            {/* Fire Button */}
            <button
              onClick={fireChaosTest}
              disabled={isRunning || availableStock === 0}
              className={`w-full py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer ${
                isRunning || availableStock === 0
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/10'
              }`}
            >
              {isRunning ? 'Firing Parallel Waves...' : 'Fire Concurrent Flash Sale'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right Column: Visual Telemetry & SSE Logs */}
        <div className="lg:col-span-7 space-y-6">
          {/* Telemetry Metrics */}
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
              <span className="text-[10px] uppercase font-bold text-slate-400">Orders Created</span>
              <p className={`text-xl font-bold mt-1 font-mono ${metrics.successful > 1 ? 'text-rose-400' : 'text-emerald-400'}`}>
                {metrics.successful}
              </p>
              <span className="text-[9px] text-slate-500">{metrics.successful > 1 ? '⚠️ Oversold!' : 'Expected: 1 max'}</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
              <span className="text-[10px] uppercase font-bold text-slate-400">Auto-Refunds</span>
              <p className="text-xl font-bold mt-1 font-mono text-amber-400">
                {metrics.refunded}
              </p>
              <span className="text-[9px] text-slate-500">100% full refund</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
              <span className="text-[10px] uppercase font-bold text-slate-400">Direct Rejections</span>
              <p className="text-xl font-bold mt-1 font-mono text-slate-300">
                {metrics.rejected}
              </p>
              <span className="text-[9px] text-slate-500">HTTP 409 Out of stock</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
              <span className="text-[10px] uppercase font-bold text-slate-400">Execution Time</span>
              <p className="text-xl font-bold mt-1 font-mono text-cyan-400">
                {metrics.duration}ms
              </p>
              <span className="text-[9px] text-slate-500">Zero lock waits</span>
            </div>
          </div>

          {/* Real-time SSE Log Stream */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col h-[380px]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" /> Real-time Event Stream (SSE)
              </span>
              <span className="flex items-center gap-1.5 text-[10px] text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Connected
              </span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 font-mono text-xs pr-1">
              {logs.length === 0 ? (
                <p className="text-slate-600 italic">No events streamed yet. Fire a test to observe concurrency...</p>
              ) : (
                logs.map((log) => (
                  <div
                    key={log.id}
                    className={`p-2 rounded flex items-start gap-2 border leading-relaxed ${
                      log.type === 'success'
                        ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                        : log.type === 'refund'
                        ? 'bg-amber-950/40 border-amber-800/60 text-amber-300'
                        : log.type === 'error'
                        ? 'bg-rose-950/40 border-rose-800/60 text-rose-300'
                        : 'bg-slate-950/60 border-slate-800/80 text-slate-400'
                    }`}
                  >
                    <span className="text-[10px] text-slate-500 shrink-0">{log.timestamp}</span>
                    <span className="flex-1 break-all">{log.text}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}