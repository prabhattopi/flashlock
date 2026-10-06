import { useEffect, useState } from 'react';
import { 
  Zap, 
  RotateCcw, 
  ShieldCheck, 
  AlertTriangle, 
  Smartphone, 
  Terminal,
  Activity,
  ArrowRight,
  Loader2,
  CheckCircle2,
  XCircle
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
  const [isResetting, setIsResetting] = useState<boolean>(false);
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
      ...prev.slice(0, 50),
    ]);
  };

  // 1. Initial Load & SSE Stream
  useEffect(() => {
    fetch(`${BACKEND_URL}/product`)
      .then((res) => res.json())
      .then((data) => {
        setProduct(data.product);
        setAvailableStock(data.availableStock);
        addLog(`System initialized. Current stock: ${data.availableStock}`, 'info');
      })
      .catch(() => addLog('Backend server unreachable on port 5000', 'error'));

    const eventSource = new EventSource(`${BACKEND_URL}/events`);

    eventSource.addEventListener('STOCK_UPDATE', (e) => {
      const data = JSON.parse(e.data);
      setAvailableStock(data.availableStock);
      addLog(`[SSE Broadcast] Inventory updated: ${data.availableStock} in stock`, 'info');
    });

    eventSource.addEventListener('REFUND_ISSUED', (e) => {
      const data = JSON.parse(e.data);
      addLog(`[Auto-Refund] User ${data.userId}: 100% full refund initiated (₹1,20,000)`, 'refund');
    });

    eventSource.addEventListener('ORDER_PLACED', (e) => {
      const data = JSON.parse(e.data);
      addLog(`[Order Confirmed] User ${data.userId} claimed iPhone 16 Pro!`, 'success');
    });

    return () => eventSource.close();
  }, []);

  // 2. Reset Database
  const handleReset = async () => {
    setIsResetting(true);
    try {
      await fetch(`${BACKEND_URL}/reset`, { method: 'POST' });
      setAvailableStock(1);
      setMetrics({ successful: 0, refunded: 0, rejected: 0, duration: 0 });
      setLogs([]);
      addLog('Database reset complete: Inventory reverted to 1 item.', 'info');
    } catch (err) {
      addLog('Reset failed to connect', 'error');
    } finally {
      setIsResetting(false);
    }
  };

  // Mode change handler with metric cleanup
  const handleModeChange = (newMode: 'naive' | 'secure') => {
    setMode(newMode);
    setMetrics({ successful: 0, refunded: 0, rejected: 0, duration: 0 });
    addLog(`Switched engine to: [${newMode.toUpperCase()}]`, 'info');
  };

  // 3. Fire Concurrent Simulation
  const fireChaosTest = async () => {
    if (!product || isRunning) return;
    setIsRunning(true);
    setMetrics({ successful: 0, refunded: 0, rejected: 0, duration: 0 });
    addLog(`Firing ${concurrencyCount} parallel buyers via [${mode.toUpperCase()}]...`, 'info');

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
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 flex flex-col items-center selection:bg-amber-500 selection:text-black">
      {/* Header */}
      <header className="w-full max-w-6xl mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <Zap className="text-amber-400 w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white">FlashLock Engine</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Shopify Unit-Pool Architecture (`SKIP LOCKED`) vs Naive TOCTOU Concurrency Simulator
          </p>
        </div>

        <button
          onClick={handleReset}
          disabled={isResetting || isRunning}
          className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs px-3.5 py-2 rounded-lg font-medium transition cursor-pointer border border-slate-700 disabled:opacity-50"
        >
          {isResetting ? <Loader2 className="w-4 h-4 animate-spin text-amber-400" /> : <RotateCcw className="w-4 h-4" />}
          Reset DB to 1 Unit
        </button>
      </header>

      <main className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Product & Control Panel */}
        <div className="lg:col-span-5 space-y-6">
          {/* Product Card */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-indigo-950 text-indigo-400 border border-indigo-800/60 inline-block">
                  Live Big Billion Flash Sale
                </span>
                <h2 className="text-lg font-bold text-white mt-2 flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-indigo-400" /> {product?.title || 'iPhone 16 Pro'}
                </h2>
                <p className="text-2xl font-mono text-emerald-400 font-bold mt-1">₹1,20,000</p>
              </div>

              {/* Real-time Stock Badge */}
              <div className="text-right">
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all duration-300 ${
                    availableStock > 0
                      ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-700/80'
                      : 'bg-rose-950/80 text-rose-400 border border-rose-700/80'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${availableStock > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                  {availableStock > 0 ? `${availableStock} IN STOCK` : 'SOLD OUT'}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-400 mt-4 leading-relaxed border-t border-slate-800 pt-3">
              100% full refund guarantee for late arrivals. Zero database connection stalls.
            </p>
          </div>

          {/* Simulation Config Panel */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-5 shadow-xl">
            <h3 className="text-xs uppercase font-bold tracking-wider text-slate-400 flex items-center gap-2">
              <Activity className="w-4 h-4 text-amber-400" /> Simulation Control
            </h3>

            {/* Mode Toggle */}
            <div className="space-y-1.5">
              <label className="text-xs text-slate-300 font-medium">Select Checkout Logic</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleModeChange('naive')}
                  className={`px-3 py-2.5 text-xs rounded-xl font-semibold flex items-center justify-center gap-1.5 border transition cursor-pointer ${
                    mode === 'naive'
                      ? 'bg-rose-950/70 border-rose-500 text-rose-200 shadow-sm'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" /> Naive (Buggy)
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange('secure')}
                  className={`px-3 py-2.5 text-xs rounded-xl font-semibold flex items-center justify-center gap-1.5 border transition cursor-pointer ${
                    mode === 'secure'
                      ? 'bg-emerald-950/70 border-emerald-500 text-emerald-200 shadow-sm'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" /> SKIP LOCKED (Shopify)
                </button>
              </div>
            </div>

            {/* Concurrency Slider */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-slate-300 font-medium">
                <span>Simultaneous Buyers</span>
                <span className="font-mono text-amber-400 font-bold">{concurrencyCount} requests</span>
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

            {/* Fire Action Button */}
            <button
              onClick={fireChaosTest}
              disabled={isRunning || availableStock === 0}
              className={`w-full py-3 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer ${
                isRunning || availableStock === 0
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold shadow-lg shadow-amber-500/10'
              }`}
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Firing Parallel Requests...
                </>
              ) : availableStock === 0 ? (
                'Sold Out (Reset DB First)'
              ) : (
                <>
                  Fire Concurrent Flash Sale <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Column: Telemetry Cards & SSE Live Feed */}
        <div className="lg:col-span-7 space-y-6">
          {/* Telemetry Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-sm">
              <span className="text-[10px] uppercase font-bold text-slate-400">Orders Created</span>
              <p className={`text-2xl font-bold mt-1 font-mono ${metrics.successful > 1 ? 'text-rose-400' : 'text-emerald-400'}`}>
                {metrics.successful}
              </p>
              <span className="text-[10px] text-slate-500 flex items-center gap-1 mt-1">
                {metrics.successful > 1 ? (
                  <span className="text-rose-400 font-bold flex items-center gap-0.5">
                    <XCircle className="w-3 h-3" /> Oversold!
                  </span>
                ) : (
                  <span className="text-slate-400 flex items-center gap-0.5">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Max 1 expected
                  </span>
                )}
              </span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-sm">
              <span className="text-[10px] uppercase font-bold text-slate-400">Auto-Refunds</span>
              <p className="text-2xl font-bold mt-1 font-mono text-amber-400">
                {metrics.refunded}
              </p>
              <span className="text-[10px] text-slate-500 block mt-1">100% full refund</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-sm">
              <span className="text-[10px] uppercase font-bold text-slate-400">Direct Rejections</span>
              <p className="text-2xl font-bold mt-1 font-mono text-slate-300">
                {metrics.rejected}
              </p>
              <span className="text-[10px] text-slate-500 block mt-1">HTTP 409 Out of stock</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5 shadow-sm">
              <span className="text-[10px] uppercase font-bold text-slate-400">Execution Time</span>
              <p className="text-2xl font-bold mt-1 font-mono text-cyan-400">
                {metrics.duration}ms
              </p>
              <span className="text-[10px] text-slate-500 block mt-1">Total wall time</span>
            </div>
          </div>

          {/* Real-time SSE Log Stream */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col h-[380px] shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" /> Real-time Event Stream (SSE)
              </span>
              <span className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Live Connected
              </span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 font-mono text-xs pr-1 scrollbar-thin">
              {logs.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-600 text-xs italic">
                  No events yet. Click 'Fire Concurrent Flash Sale' to observe behavior...
                </div>
              ) : (
                logs.map((log) => (
                  <div
                    key={log.id}
                    className={`p-2 rounded-lg flex items-start gap-2.5 border leading-relaxed ${
                      log.type === 'success'
                        ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                        : log.type === 'refund'
                        ? 'bg-amber-950/40 border-amber-800/60 text-amber-300'
                        : log.type === 'error'
                        ? 'bg-rose-950/40 border-rose-800/60 text-rose-300'
                        : 'bg-slate-950/60 border-slate-800/80 text-slate-400'
                    }`}
                  >
                    <span className="text-[10px] text-slate-500 shrink-0 font-sans">{log.timestamp}</span>
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