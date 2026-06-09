import { useState, useEffect, useCallback, useRef } from "react";

const COINS = [
  { id: "bitcoin", symbol: "BTC", name: "Bitcoin" },
  { id: "ethereum", symbol: "ETH", name: "Ethereum" },
  { id: "solana", symbol: "SOL", name: "Solana" },
  { id: "binancecoin", symbol: "BNB", name: "BNB" },
  { id: "ripple", symbol: "XRP", name: "XRP" },
  { id: "cardano", symbol: "ADA", name: "Cardano" },
];

const REFRESH_INTERVAL = 30000;
const MAX_HISTORY = 100;

// ── Technical Indicators ──────────────────────────────────────────────────────

function calcSMA(prices, period) {
  if (prices.length < period) return null;
  return prices.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calcEMA(prices, period) {
  if (prices.length < period) return null;
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) ema = prices[i] * k + ema * (1 - k);
  return ema;
}

function calcRSI(prices, period = 14) {
  if (prices.length < period + 1) return null;
  const changes = [];
  for (let i = 1; i < prices.length; i++) changes.push(prices[i] - prices[i - 1]);
  const recent = changes.slice(-period);
  const gains = recent.filter(c => c > 0).reduce((a, b) => a + b, 0) / period;
  const losses = recent.filter(c => c < 0).map(c => Math.abs(c)).reduce((a, b) => a + b, 0) / period;
  if (losses === 0) return 100;
  return 100 - 100 / (1 + gains / losses);
}

function calcMACD(prices) {
  const ema12 = calcEMA(prices, 12);
  const ema26 = calcEMA(prices, 26);
  if (!ema12 || !ema26) return null;
  return ema12 - ema26;
}

function calcBollinger(prices, period = 20) {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  const sma = slice.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(slice.reduce((s, p) => s + Math.pow(p - sma, 2), 0) / period);
  return { upper: sma + 2 * std, middle: sma, lower: sma - 2 * std };
}

function generateSignal(prices, currentPrice) {
  if (prices.length < 14) return { signal: "AGUARDANDO", strength: 0, reasons: [] };
  const rsi = calcRSI(prices);
  const macd = calcMACD(prices);
  const sma20 = calcSMA(prices, 20);
  const sma50 = calcSMA(prices, 50);
  const bb = calcBollinger(prices);
  const ema9 = calcEMA(prices, 9);
  let score = 0;
  const reasons = [];
  if (rsi !== null) {
    if (rsi < 35) { score += 2; reasons.push(`RSI ${rsi.toFixed(1)} — Sobrevendido`); }
    else if (rsi > 65) { score -= 2; reasons.push(`RSI ${rsi.toFixed(1)} — Sobrecomprado`); }
    else reasons.push(`RSI ${rsi.toFixed(1)} — Neutro`);
  }
  if (macd !== null) { if (macd > 0) { score += 1; reasons.push("MACD positivo"); } else { score -= 1; reasons.push("MACD negativo"); } }
  if (sma20 && sma50) { if (sma20 > sma50) { score += 1; reasons.push("SMA20 > SMA50 (Golden)"); } else { score -= 1; reasons.push("SMA20 < SMA50 (Death)"); } }
  if (bb) { if (currentPrice < bb.lower) { score += 2; reasons.push("Abaixo da Banda Inferior"); } else if (currentPrice > bb.upper) { score -= 2; reasons.push("Acima da Banda Superior"); } }
  if (ema9 && sma20) { if (ema9 > sma20) { score += 1; reasons.push("EMA9 cruzou SMA20 para cima"); } else { score -= 1; reasons.push("EMA9 abaixo da SMA20"); } }
  const strength = Math.min(Math.abs(score) / 7, 1);
  const signal = score >= 3 ? "COMPRA" : score <= -3 ? "VENDA" : "NEUTRO";
  return { signal, strength, score, reasons, rsi, macd, sma20, bb };
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

function Sparkline({ prices, signal }) {
  if (!prices || prices.length < 2) return null;
  const w = 80, h = 30;
  const min = Math.min(...prices), max = Math.max(...prices);
  const range = max - min || 1;
  const pts = prices.map((p, i) => `${(i / (prices.length - 1)) * w},${h - ((p - min) / range) * h}`).join(" ");
  const color = signal === "COMPRA" ? "#00ff88" : signal === "VENDA" ? "#ff4466" : "#888";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={pts} opacity="0.8" />
    </svg>
  );
}

// ── Signal Badge ──────────────────────────────────────────────────────────────

function SignalBadge({ signal, small }) {
  const cfg = {
    COMPRA:    { bg: "rgba(0,255,136,0.12)",   border: "#00ff88", text: "#00ff88", icon: "▲" },
    VENDA:     { bg: "rgba(255,68,102,0.12)",  border: "#ff4466", text: "#ff4466", icon: "▼" },
    NEUTRO:    { bg: "rgba(255,200,50,0.10)",  border: "#ffc832", text: "#ffc832", icon: "◆" },
    AGUARDANDO:{ bg: "rgba(120,120,180,0.10)", border: "#7878b4", text: "#7878b4", icon: "…" },
  };
  const c = cfg[signal] || cfg.NEUTRO;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      background: c.bg, border: `1px solid ${c.border}`, color: c.text,
      borderRadius: 5, padding: small ? "2px 7px" : "3px 10px",
      fontSize: small ? 10 : 11, fontWeight: 700, letterSpacing: 1.2,
      textTransform: "uppercase", fontFamily: "'Space Mono', monospace",
    }}>
      <span>{c.icon}</span>{signal}
    </span>
  );
}

// ── Strength Bar ──────────────────────────────────────────────────────────────

function StrengthBar({ strength, signal }) {
  const color = signal === "COMPRA" ? "#00ff88" : signal === "VENDA" ? "#ff4466" : "#ffc832";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${strength * 100}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.6s ease" }} />
      </div>
      <span style={{ fontSize: 10, color: "#666", fontFamily: "'Space Mono', monospace", minWidth: 30 }}>
        {(strength * 100).toFixed(0)}%
      </span>
    </div>
  );
}

// ── Coin Card ─────────────────────────────────────────────────────────────────

function CoinCard({ coin, data, selected, onClick }) {
  if (!data) return (
    <div onClick={onClick} style={cardBase(false)} className="coin-card">
      <div style={{ color: "#444", fontSize: 12, fontFamily: "'Space Mono', monospace" }}>Carregando {coin.symbol}…</div>
    </div>
  );
  const { price, change24h, prices, signalData } = data;
  const { signal, strength } = signalData;
  const isUp = change24h >= 0;
  return (
    <div onClick={onClick} style={cardBase(selected)} className="coin-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 11, color: "#555", fontFamily: "'Space Mono', monospace", letterSpacing: 1 }}>{coin.symbol}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#e8e8e8", fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1, lineHeight: 1.1 }}>
            ${price?.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 11, color: isUp ? "#00ff88" : "#ff4466", fontFamily: "'Space Mono', monospace", marginTop: 2 }}>
            {isUp ? "▲" : "▼"} {Math.abs(change24h).toFixed(2)}%
          </div>
        </div>
        <Sparkline prices={prices} signal={signal} />
      </div>
      <div style={{ marginTop: 10 }}>
        <SignalBadge signal={signal} />
        <div style={{ marginTop: 8 }}><StrengthBar strength={strength} signal={signal} /></div>
      </div>
    </div>
  );
}

function cardBase(selected) {
  return {
    background: selected ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.02)",
    border: selected ? "1px solid rgba(255,255,255,0.15)" : "1px solid rgba(255,255,255,0.06)",
    borderRadius: 12, padding: "14px 16px", cursor: "pointer",
    transition: "all 0.2s ease",
    boxShadow: selected ? "0 0 20px rgba(0,0,0,0.4)" : "none",
  };
}

// ── Detail Panel ──────────────────────────────────────────────────────────────

function DetailPanel({ coin, data }) {
  if (!data) return null;
  const { price, change24h, high24h, low24h, volume, marketCap, signalData } = data;
  const { signal, strength, reasons, rsi, macd, sma20, bb } = signalData;
  const statStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" };
  const labelStyle = { fontSize: 11, color: "#555", fontFamily: "'Space Mono', monospace", letterSpacing: 0.5 };
  const valueStyle = { fontSize: 12, color: "#ccc", fontFamily: "'Space Mono', monospace" };
  return (
    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 13, color: "#888", fontFamily: "'Space Mono', monospace" }}>{coin.name}</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: "#fff", fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2 }}>
            ${price?.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <SignalBadge signal={signal} />
          <div style={{ marginTop: 8 }}><StrengthBar strength={strength} signal={signal} /></div>
        </div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: "#444", fontFamily: "'Space Mono', monospace", letterSpacing: 1.5, marginBottom: 8 }}>MÉTRICAS DE MERCADO</div>
        {[
          ["Variação 24h", `${change24h >= 0 ? "+" : ""}${change24h?.toFixed(2)}%`, change24h >= 0 ? "#00ff88" : "#ff4466"],
          ["Máxima 24h", `$${high24h?.toLocaleString("en-US", { maximumFractionDigits: 2 })}`],
          ["Mínima 24h", `$${low24h?.toLocaleString("en-US", { maximumFractionDigits: 2 })}`],
          ["Volume 24h", `$${(volume / 1e6).toFixed(1)}M`],
          ["Market Cap", `$${(marketCap / 1e9).toFixed(2)}B`],
        ].map(([label, value, color]) => (
          <div key={label} style={statStyle}>
            <span style={labelStyle}>{label}</span>
            <span style={{ ...valueStyle, color: color || "#ccc" }}>{value}</span>
          </div>
        ))}
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: "#444", fontFamily: "'Space Mono', monospace", letterSpacing: 1.5, marginBottom: 8 }}>INDICADORES TÉCNICOS</div>
        {[
          ["RSI (14)", rsi ? `${rsi.toFixed(1)}${rsi < 35 ? " 🟢" : rsi > 65 ? " 🔴" : " 🟡"}` : "—"],
          ["MACD", macd ? `${macd > 0 ? "+" : ""}${macd.toFixed(4)}` : "—"],
          ["SMA 20", sma20 ? `$${sma20.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—"],
          ["Bollinger Up", bb ? `$${bb.upper.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—"],
          ["Bollinger Low", bb ? `$${bb.lower.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—"],
        ].map(([label, value]) => (
          <div key={label} style={statStyle}>
            <span style={labelStyle}>{label}</span>
            <span style={valueStyle}>{value}</span>
          </div>
        ))}
      </div>
      <div>
        <div style={{ fontSize: 10, color: "#444", fontFamily: "'Space Mono', monospace", letterSpacing: 1.5, marginBottom: 8 }}>MOTIVOS DO SINAL</div>
        {reasons.map((r, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#444", flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: "#888", fontFamily: "'Space Mono', monospace" }}>{r}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── History Panel ─────────────────────────────────────────────────────────────

function HistoryPanel({ history, onClear }) {
  const [filter, setFilter] = useState("TODOS");
  const filters = ["TODOS", "COMPRA", "VENDA", "NEUTRO"];

  const filtered = filter === "TODOS" ? history : history.filter(h => h.signal === filter);

  if (history.length === 0) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200, gap: 12 }}>
      <div style={{ fontSize: 28, opacity: 0.2 }}>📋</div>
      <div style={{ fontSize: 11, color: "#444", fontFamily: "'Space Mono', monospace", textAlign: "center", lineHeight: 1.8 }}>
        Nenhum sinal registrado ainda.<br />Os sinais aparecem aqui<br />conforme forem gerados.
      </div>
    </div>
  );

  const counts = history.reduce((acc, h) => { acc[h.signal] = (acc[h.signal] || 0) + 1; return acc; }, {});

  return (
    <div>
      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
        {[["COMPRA", "#00ff88"], ["VENDA", "#ff4466"], ["NEUTRO", "#ffc832"]].map(([s, c]) => (
          <div key={s} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 8, padding: "8px 6px", textAlign: "center" }}>
            <div style={{ fontSize: 18, fontFamily: "'Bebas Neue', sans-serif", color: c, letterSpacing: 1 }}>{counts[s] || 0}</div>
            <div style={{ fontSize: 9, color: "#444", fontFamily: "'Space Mono', monospace", letterSpacing: 1 }}>{s}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {filters.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            flex: 1, padding: "4px 0", fontSize: 9, fontFamily: "'Space Mono', monospace",
            background: filter === f ? "rgba(255,255,255,0.08)" : "transparent",
            border: `1px solid ${filter === f ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)"}`,
            color: filter === f ? "#ccc" : "#444", borderRadius: 5, cursor: "pointer", letterSpacing: 0.5,
          }}>{f}</button>
        ))}
      </div>

      {/* Entries */}
      <div style={{ display: "grid", gap: 6, maxHeight: 340, overflowY: "auto" }}>
        {filtered.length === 0 ? (
          <div style={{ fontSize: 11, color: "#444", fontFamily: "'Space Mono', monospace", textAlign: "center", padding: "20px 0" }}>
            Nenhum sinal do tipo "{filter}"
          </div>
        ) : filtered.map((entry, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
            borderRadius: 8, animation: i === 0 ? "fadeIn 0.3s ease" : "none",
          }}>
            <SignalBadge signal={entry.signal} small />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: "#ccc", fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>{entry.symbol}</div>
              <div style={{ fontSize: 10, color: "#555", fontFamily: "'Space Mono', monospace" }}>
                ${entry.price?.toLocaleString("en-US", { maximumFractionDigits: 2 })}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 9, color: "#444", fontFamily: "'Space Mono', monospace" }}>{entry.time}</div>
              <div style={{ fontSize: 10, color: entry.signal === "COMPRA" ? "#00ff88" : entry.signal === "VENDA" ? "#ff4466" : "#ffc832", fontFamily: "'Space Mono', monospace" }}>
                {Math.round(entry.strength * 100)}%
              </div>
            </div>
          </div>
        ))}
      </div>

      {history.length > 0 && (
        <button onClick={onClear} style={{
          width: "100%", marginTop: 12, padding: "7px 0", fontSize: 10,
          fontFamily: "'Space Mono', monospace", background: "transparent",
          border: "1px solid rgba(255,68,68,0.15)", color: "#633", borderRadius: 6,
          cursor: "pointer", letterSpacing: 1,
        }}>
          🗑 LIMPAR HISTÓRICO
        </button>
      )}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function CryptoSignalBot() {
  const [marketData, setMarketData] = useState({});
  const [priceHistory, setPriceHistory] = useState({});
  const [signalHistory, setSignalHistory] = useState([]);
  const [lastSignals, setLastSignals] = useState({});
  const [selectedCoin, setSelectedCoin] = useState(COINS[0]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL / 1000);
  const [error, setError] = useState(null);
  const [rightTab, setRightTab] = useState("detalhes"); // "detalhes" | "historico"
  const intervalRef = useRef(null);
  const countdownRef = useRef(null);
  const lastSignalsRef = useRef({});

  // Load history from storage on mount
  useEffect(() => {
    (async () => {
      try {
        const saved = await window.storage.get("signal-history");
        if (saved?.value) setSignalHistory(JSON.parse(saved.value));
      } catch (_) {}
    })();
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const ids = COINS.map(c => c.id).join(",");
      const res = await fetch(
        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&sparkline=false&price_change_percentage=24h`
      );
      if (!res.ok) throw new Error("API error");
      const json = await res.json();

      const newData = {};
      const newEntries = [];

      json.forEach(coin => {
        const history = priceHistory[coin.id] || [];
        const updated = [...history, coin.current_price].slice(-50);
        const signalData = generateSignal(updated, coin.current_price);

        newData[coin.id] = {
          price: coin.current_price,
          change24h: coin.price_change_percentage_24h,
          high24h: coin.high_24h,
          low24h: coin.low_24h,
          volume: coin.total_volume,
          marketCap: coin.market_cap,
          prices: updated,
          signalData,
        };

        setPriceHistory(prev => ({ ...prev, [coin.id]: updated }));

        // Track signal changes — only record if signal changed or first time
        const prevSignal = lastSignalsRef.current[coin.id];
        if (signalData.signal !== "AGUARDANDO" && signalData.signal !== prevSignal) {
          lastSignalsRef.current[coin.id] = signalData.signal;
          newEntries.push({
            symbol: coin.symbol.toUpperCase(),
            coinId: coin.id,
            signal: signalData.signal,
            strength: signalData.strength,
            price: coin.current_price,
            time: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
            date: new Date().toLocaleDateString("pt-BR"),
            ts: Date.now(),
          });
        }
      });

      if (newEntries.length > 0) {
        setSignalHistory(prev => {
          const updated = [...newEntries, ...prev].slice(0, MAX_HISTORY);
          window.storage.set("signal-history", JSON.stringify(updated)).catch(() => {});
          return updated;
        });
      }

      setMarketData(newData);
      setLastUpdate(new Date());
      setLoading(false);
      setCountdown(REFRESH_INTERVAL / 1000);
    } catch (e) {
      setError("Erro ao buscar dados. Tentando novamente...");
      setLoading(false);
    }
  }, [priceHistory]);

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, REFRESH_INTERVAL);
    countdownRef.current = setInterval(() => {
      setCountdown(c => c <= 1 ? REFRESH_INTERVAL / 1000 : c - 1);
    }, 1000);
    return () => { clearInterval(intervalRef.current); clearInterval(countdownRef.current); };
  }, []);

  const clearHistory = async () => {
    setSignalHistory([]);
    try { await window.storage.delete("signal-history"); } catch (_) {}
  };

  const signalCounts = Object.values(marketData).reduce(
    (acc, d) => { if (d?.signalData?.signal) acc[d.signalData.signal] = (acc[d.signalData.signal] || 0) + 1; return acc; },
    {}
  );

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", color: "#e8e8e8", fontFamily: "'Space Mono', monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Space+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .coin-card:hover { background: rgba(255,255,255,0.04) !important; transform: translateY(-1px); }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #222; border-radius: 4px; }
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:translateY(0) } }
        .fade-in { animation: fadeIn 0.4s ease forwards; }
        .tab-btn:hover { color: #aaa !important; }
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: error ? "#ff4466" : "#00ff88", animation: "pulse 2s infinite" }} />
          <span style={{ fontWeight: 700, letterSpacing: 3, color: "#fff", fontFamily: "'Bebas Neue', sans-serif", fontSize: 20 }}>CRYPTO SIGNAL BOT</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 10, color: "#444" }}>
          {lastUpdate && <span>Atualizado: {lastUpdate.toLocaleTimeString("pt-BR")}</span>}
          <div style={{ width: 28, height: 28, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#666", position: "relative" }}>
            <svg style={{ position: "absolute", top: 0, left: 0, transform: "rotate(-90deg)" }} width="28" height="28">
              <circle cx="14" cy="14" r="12" fill="none" stroke="#00ff88" strokeWidth="2"
                strokeDasharray={`${(1 - countdown / (REFRESH_INTERVAL / 1000)) * 75.4} 75.4`}
                style={{ transition: "stroke-dasharray 1s linear" }} />
            </svg>
            <span style={{ zIndex: 1 }}>{countdown}</span>
          </div>
          <button onClick={fetchData} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#888", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 10, letterSpacing: 1 }}>
            ↻ ATUALIZAR
          </button>
        </div>
      </div>

      {/* Summary Bar */}
      {!loading && (
        <div style={{ padding: "10px 24px", borderBottom: "1px solid rgba(255,255,255,0.04)", display: "flex", gap: 20, fontSize: 10, alignItems: "center" }}>
          {[["COMPRA", "#00ff88"], ["VENDA", "#ff4466"], ["NEUTRO", "#ffc832"]].map(([s, c]) => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 6, color: "#555" }}>
              <span style={{ color: c, fontWeight: 700 }}>{signalCounts[s] || 0}</span>
              <span style={{ letterSpacing: 1 }}>{s}</span>
            </div>
          ))}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, color: "#444" }}>
            <span style={{ color: "#555" }}>{signalHistory.length}</span>
            <span style={{ letterSpacing: 1 }}>SINAIS NO HISTÓRICO</span>
          </div>
          {error && <span style={{ color: "#ff4466" }}>{error}</span>}
        </div>
      )}

      {/* Main Content */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 0, height: "calc(100vh - 105px)" }}>

        {/* Coin Grid */}
        <div style={{ padding: 20, overflowY: "auto" }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "#333", fontSize: 11, letterSpacing: 2 }}>
              CARREGANDO DADOS...
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
              {COINS.map(coin => (
                <div key={coin.id} className="fade-in">
                  <CoinCard
                    coin={coin}
                    data={marketData[coin.id]}
                    selected={selectedCoin.id === coin.id}
                    onClick={() => { setSelectedCoin(coin); setRightTab("detalhes"); }}
                  />
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 24, padding: 12, background: "rgba(255,200,50,0.04)", border: "1px solid rgba(255,200,50,0.1)", borderRadius: 8, fontSize: 10, color: "#554", lineHeight: 1.6 }}>
            ⚠ AVISO: Sinais gerados por análise técnica. Não constituem recomendação de investimento. Use com gestão de risco adequada.
          </div>
        </div>

        {/* Right Panel */}
        <div style={{ borderLeft: "1px solid rgba(255,255,255,0.05)", display: "flex", flexDirection: "column" }}>

          {/* Tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            {[["detalhes", "DETALHES"], ["historico", `HISTÓRICO ${signalHistory.length > 0 ? `(${signalHistory.length})` : ""}`]].map(([key, label]) => (
              <button key={key} className="tab-btn" onClick={() => setRightTab(key)} style={{
                flex: 1, padding: "12px 8px", fontSize: 10, fontFamily: "'Space Mono', monospace",
                background: "transparent", border: "none", cursor: "pointer", letterSpacing: 1,
                color: rightTab === key ? "#fff" : "#444",
                borderBottom: rightTab === key ? "2px solid #00ff88" : "2px solid transparent",
                transition: "all 0.15s",
              }}>{label}</button>
            ))}
          </div>

          {/* Tab Content */}
          <div style={{ flex: 1, padding: 16, overflowY: "auto" }}>
            {rightTab === "detalhes" ? (
              selectedCoin && marketData[selectedCoin.id] ? (
                <DetailPanel coin={selectedCoin} data={marketData[selectedCoin.id]} />
              ) : (
                <div style={{ color: "#333", fontSize: 11, marginTop: 20, textAlign: "center" }}>Selecione uma moeda</div>
              )
            ) : (
              <HistoryPanel history={signalHistory} onClear={clearHistory} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
