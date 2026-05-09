import { useState, useCallback, useRef } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, AreaChart, Area
} from "recharts";

// ─── CONSTANTS ──────────────────────────────────────────────────────────────

const API = "http://localhost:8000/api/v1";

const COLORS = {
  loss: "#ef4444",
  gain: "#22c55e",
  neutral: "#64748b",
  primary: "#f59e0b",
  accent: "#0ea5e9",
  bg: "#0a0e1a",
  card: "#111827",
  border: "#1e293b",
  text: "#e2e8f0",
  muted: "#64748b",
};

const ASSET_COLORS = {
  loan: "#f59e0b",
  mortgage: "#0ea5e9",
  equity: "#a78bfa",
  bond: "#34d399",
  collateral: "#fb923c",
  fx: "#f472b6",
};

const PREDEFINED_SCENARIOS = [
  { id: "2008_financial_crisis", name: "2008 Financial Crisis", severity: "Severe" },
  { id: "covid_shock", name: "COVID-19 Shock", severity: "Severe" },
  { id: "rate_hike_shock", name: "Aggressive Rate Hike", severity: "Moderate" },
  { id: "emerging_market_crisis", name: "EM Currency Crisis", severity: "Severe" },
  { id: "mild_recession", name: "Mild Recession", severity: "Mild" },
];

const SHOCK_TYPES = ["equity", "interest_rate", "fx", "credit_spread", "volatility"];

const MOCK_POSITIONS = [
  { position_id: "POS001", asset_class: "loan", notional: 1000000, market_value: 980000, currency: "USD", pd: 0.02, lgd: 0.45, duration: 3.5 },
  { position_id: "POS002", asset_class: "mortgage", notional: 500000, market_value: 495000, currency: "USD", pd: 0.015, lgd: 0.35, ltv_ratio: 0.75, duration: 7.2 },
  { position_id: "POS003", asset_class: "equity", notional: 250000, market_value: 260000, currency: "USD", beta: 1.2 },
  { position_id: "POS004", asset_class: "bond", notional: 750000, market_value: 740000, currency: "EUR", pd: 0.01, lgd: 0.40, duration: 5.8 },
  { position_id: "POS005", asset_class: "collateral", notional: 300000, market_value: 295000, currency: "USD", pd: 0.025, lgd: 0.50, ltv_ratio: 0.60, duration: 1.5 },
  { position_id: "POS006", asset_class: "fx", notional: 400000, market_value: 398000, currency: "GBP", fx_sensitivity: 1.0 },
];

// ─── STRESS ENGINE (client-side simulation) ─────────────────────────────────

function runStressEngine(positions, scenario) {
  const results = positions.map(pos => {
    let stressed = pos.market_value;

    for (const shock of scenario.shocks) {
      if (shock.shock_type === "equity" && pos.asset_class === "equity") {
        const beta = pos.beta || 1.0;
        stressed = pos.market_value * (1 + beta * shock.magnitude);
      } else if (shock.shock_type === "interest_rate" && ["loan","mortgage","bond","collateral"].includes(pos.asset_class)) {
        const dur = pos.duration || 3.0;
        const conv = (dur ** 2) / 100;
        const change = (-dur * shock.magnitude) + (0.5 * conv * shock.magnitude ** 2);
        stressed = pos.market_value * (1 + change);
      } else if (shock.shock_type === "fx" && pos.currency !== "USD") {
        const fx_s = pos.fx_sensitivity || 1.0;
        stressed = pos.market_value * (1 + fx_s * shock.magnitude);
      } else if (shock.shock_type === "credit_spread") {
        const dur = pos.duration || 2.0;
        stressed = pos.market_value * (1 - dur * shock.magnitude);
      }
    }

    stressed = Math.max(stressed, 0);
    const absLoss = pos.market_value - stressed;
    const pctLoss = (absLoss / pos.market_value) * 100;
    const pd = pos.pd || 0.02;
    const lgd = pos.lgd || 0.45;
    const el = pd * lgd * stressed;

    return {
      position_id: pos.position_id,
      asset_class: pos.asset_class,
      base_value: pos.market_value,
      stressed_value: stressed,
      absolute_loss: absLoss,
      percentage_loss: pctLoss,
      expected_loss: el,
    };
  });

  const totalBase = results.reduce((s, r) => s + r.base_value, 0);
  const totalStressed = results.reduce((s, r) => s + r.stressed_value, 0);
  const totalLoss = totalBase - totalStressed;
  const totalEL = results.reduce((s, r) => s + r.expected_loss, 0);

  const lossByAC = {};
  results.forEach(r => {
    lossByAC[r.asset_class] = (lossByAC[r.asset_class] || 0) + r.absolute_loss;
  });

  // MC VaR
  const simLosses = Array.from({ length: 500 }, () => {
    return results.reduce((s, r) => {
      const noise = (Math.random() - 0.5) * 0.04;
      return s + r.absolute_loss * (1 + noise);
    }, 0);
  }).sort((a, b) => b - a);

  const var95 = simLosses[Math.floor(0.05 * simLosses.length)];
  const var99 = simLosses[Math.floor(0.01 * simLosses.length)];
  const es95 = simLosses.slice(0, Math.floor(0.05 * simLosses.length)).reduce((a, b) => a + b, 0) /
    Math.max(1, Math.floor(0.05 * simLosses.length));

  return {
    scenario_name: scenario.name,
    total_base_value: totalBase,
    total_stressed_value: totalStressed,
    total_loss: totalLoss,
    total_loss_pct: (totalLoss / totalBase) * 100,
    total_expected_loss: totalEL,
    var_95: var95,
    var_99: var99,
    es_95: es95,
    position_results: results,
    loss_by_asset_class: lossByAC,
  };
}

const SCENARIO_SHOCKS = {
  "2008_financial_crisis": {
    name: "2008 Financial Crisis",
    shocks: [
      { shock_type: "equity", magnitude: -0.45 },
      { shock_type: "interest_rate", magnitude: 0.015 },
      { shock_type: "credit_spread", magnitude: 0.04 },
      { shock_type: "fx", magnitude: -0.12 },
    ],
  },
  "covid_shock": {
    name: "COVID-19 Shock",
    shocks: [
      { shock_type: "equity", magnitude: -0.34 },
      { shock_type: "interest_rate", magnitude: -0.01 },
      { shock_type: "credit_spread", magnitude: 0.025 },
    ],
  },
  "rate_hike_shock": {
    name: "Aggressive Rate Hike",
    shocks: [
      { shock_type: "interest_rate", magnitude: 0.03 },
      { shock_type: "equity", magnitude: -0.20 },
      { shock_type: "credit_spread", magnitude: 0.015 },
    ],
  },
  "emerging_market_crisis": {
    name: "EM Currency Crisis",
    shocks: [
      { shock_type: "fx", magnitude: -0.30 },
      { shock_type: "equity", magnitude: -0.25 },
      { shock_type: "credit_spread", magnitude: 0.02 },
    ],
  },
  "mild_recession": {
    name: "Mild Recession",
    shocks: [
      { shock_type: "equity", magnitude: -0.15 },
      { shock_type: "interest_rate", magnitude: 0.005 },
      { shock_type: "credit_spread", magnitude: 0.0075 },
    ],
  },
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const fmt = (n) =>
  n >= 1e6
    ? `$${(n / 1e6).toFixed(2)}M`
    : n >= 1e3
    ? `$${(n / 1e3).toFixed(1)}K`
    : `$${n.toFixed(0)}`;

const fmtPct = (n) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

// ─── COMPONENTS ──────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, color = COLORS.text, icon }) {
  return (
    <div style={{
      background: COLORS.card,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 12,
      padding: "20px 24px",
      display: "flex",
      flexDirection: "column",
      gap: 6,
    }}>
      <div style={{ fontSize: 11, color: COLORS.muted, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "mono" }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color, fontFamily: "'DM Mono', monospace" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: COLORS.muted }}>{sub}</div>}
    </div>
  );
}

function SectionHeader({ title, sub }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, letterSpacing: "0.02em" }}>{title}</div>
      {sub && <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Badge({ text, color = "#334155" }) {
  return (
    <span style={{
      background: color + "33",
      color,
      border: `1px solid ${color}55`,
      borderRadius: 6,
      padding: "2px 8px",
      fontSize: 11,
      fontWeight: 600,
    }}>
      {text}
    </span>
  );
}

const SEVERITY_COLOR = { Severe: "#ef4444", Moderate: "#f59e0b", Mild: "#22c55e" };

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

export default function StressTestApp() {
  const [tab, setTab] = useState("dashboard");
  const [selectedScenarioId, setSelectedScenarioId] = useState("2008_financial_crisis");
  const [customShocks, setCustomShocks] = useState([{ shock_type: "equity", magnitude: -0.20 }]);
  const [customName, setCustomName] = useState("My Custom Scenario");
  const [result, setResult] = useState(null);
  const [batchResults, setBatchResults] = useState(null);
  const [positions, setPositions] = useState(MOCK_POSITIONS);
  const [isRunning, setIsRunning] = useState(false);
  const [useCustom, setUseCustom] = useState(false);
  const fileRef = useRef();

  const runTest = useCallback(() => {
    setIsRunning(true);
    setTimeout(() => {
      const scenario = useCustom
        ? { name: customName, shocks: customShocks }
        : SCENARIO_SHOCKS[selectedScenarioId];
      const r = runStressEngine(positions, scenario);
      setResult(r);
      setTab("results");
      setIsRunning(false);
    }, 600);
  }, [positions, selectedScenarioId, useCustom, customName, customShocks]);

  const runBatch = useCallback(() => {
    setIsRunning(true);
    setTimeout(() => {
      const results = Object.entries(SCENARIO_SHOCKS).map(([id, sc]) => {
        const r = runStressEngine(positions, sc);
        const meta = PREDEFINED_SCENARIOS.find(s => s.id === id);
        return { ...r, scenario_id: id, severity: meta?.severity };
      });
      setBatchResults(results);
      setTab("batch");
      setIsRunning(false);
    }, 800);
  }, [positions]);

  const handleCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const lines = ev.target.result.trim().split("\n");
      const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/ /g, "_"));
      const parsed = lines.slice(1).map(line => {
        const vals = line.split(",");
        const obj = {};
        headers.forEach((h, i) => {
          const v = vals[i]?.trim();
          obj[h] = isNaN(v) || v === "" ? v : parseFloat(v);
        });
        return obj;
      }).filter(p => p.position_id && p.market_value);
      if (parsed.length > 0) setPositions(parsed);
    };
    reader.readAsText(file);
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: COLORS.bg,
      color: COLORS.text,
      fontFamily: "'IBM Plex Sans', 'Segoe UI', sans-serif",
      fontSize: 14,
    }}>
      {/* HEADER */}
      <div style={{
        borderBottom: `1px solid ${COLORS.border}`,
        padding: "0 32px",
        display: "flex",
        alignItems: "center",
        gap: 24,
        height: 56,
        background: "#0d1117",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            background: "linear-gradient(135deg, #f59e0b, #ef4444)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14,
          }}>⚡</div>
          <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.01em" }}>FinStress</span>
          <span style={{ color: COLORS.muted, fontSize: 12 }}>/ Stress Testing Platform</span>
        </div>
        <div style={{ flex: 1 }} />
        {["dashboard", "scenarios", "results", "batch"].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? "#1e293b" : "transparent",
            border: "none",
            color: tab === t ? COLORS.text : COLORS.muted,
            padding: "6px 14px",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 13,
            fontWeight: tab === t ? 600 : 400,
            textTransform: "capitalize",
          }}>{t}</button>
        ))}
      </div>

      <div style={{ padding: "28px 32px", maxWidth: 1400, margin: "0 auto" }}>

        {/* DASHBOARD TAB */}
        {tab === "dashboard" && (
          <div>
            <div style={{ marginBottom: 28 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>
                Portfolio Overview
              </h1>
              <p style={{ color: COLORS.muted, margin: "4px 0 0", fontSize: 13 }}>
                {positions.length} positions loaded · Total MV: {fmt(positions.reduce((s, p) => s + p.market_value, 0))}
              </p>
            </div>

            {/* KPI row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
              <MetricCard label="Total Market Value" value={fmt(positions.reduce((s, p) => s + p.market_value, 0))} sub="Current portfolio value" icon="💼" />
              <MetricCard label="Total Notional" value={fmt(positions.reduce((s, p) => s + p.notional, 0))} sub="Face value" icon="📋" />
              <MetricCard label="Positions" value={positions.length} sub={`${[...new Set(positions.map(p => p.asset_class))].length} asset classes`} icon="📊" color={COLORS.accent} />
              <MetricCard label="Currencies" value={[...new Set(positions.map(p => p.currency))].join(", ")} sub="Multi-currency portfolio" icon="💱" color={COLORS.primary} />
            </div>

            {/* Charts row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 28 }}>
              <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 20 }}>
                <SectionHeader title="Market Value by Asset Class" />
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={Object.entries(
                    positions.reduce((acc, p) => { acc[p.asset_class] = (acc[p.asset_class] || 0) + p.market_value; return acc; }, {})
                  ).map(([k, v]) => ({ name: k, value: v }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
                    <XAxis dataKey="name" tick={{ fill: COLORS.muted, fontSize: 11 }} />
                    <YAxis tick={{ fill: COLORS.muted, fontSize: 11 }} tickFormatter={v => `$${(v/1e3).toFixed(0)}K`} />
                    <Tooltip formatter={(v) => fmt(v)} contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8 }} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {Object.keys(ASSET_COLORS).map(k => (
                        <Cell key={k} fill={ASSET_COLORS[k] || COLORS.accent} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 20 }}>
                <SectionHeader title="Portfolio Composition" />
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={Object.entries(
                      positions.reduce((acc, p) => { acc[p.asset_class] = (acc[p.asset_class] || 0) + p.market_value; return acc; }, {})
                    ).map(([k, v]) => ({ name: k, value: v }))}
                      cx="50%" cy="50%" outerRadius={85} innerRadius={45}
                      dataKey="value" label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}
                      labelLine={{ stroke: COLORS.muted }}
                    >
                      {Object.keys(ASSET_COLORS).map((k, i) => (
                        <Cell key={i} fill={Object.values(ASSET_COLORS)[i]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={fmt} contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Positions Table */}
            <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <SectionHeader title="Portfolio Positions" sub="All loaded positions" />
                <div style={{ display: "flex", gap: 10 }}>
                  <input ref={fileRef} type="file" accept=".csv" onChange={handleCSV} style={{ display: "none" }} />
                  <button onClick={() => fileRef.current?.click()} style={{
                    background: "#1e293b", border: `1px solid ${COLORS.border}`, color: COLORS.text,
                    padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12,
                  }}>📂 Upload CSV</button>
                  <button onClick={() => setPositions(MOCK_POSITIONS)} style={{
                    background: "#1e293b", border: `1px solid ${COLORS.border}`, color: COLORS.muted,
                    padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12,
                  }}>Reset Demo</button>
                </div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                      {["ID", "Asset Class", "Notional", "Market Value", "Currency", "PD", "LGD", "Beta/Dur"].map(h => (
                        <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, color: COLORS.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((p, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${COLORS.border}22` }}>
                        <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 12, color: COLORS.accent }}>{p.position_id}</td>
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{ background: (ASSET_COLORS[p.asset_class] || "#64748b") + "22", color: ASSET_COLORS[p.asset_class] || "#64748b", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                            {p.asset_class}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px", fontFamily: "monospace" }}>{fmt(p.notional)}</td>
                        <td style={{ padding: "10px 12px", fontFamily: "monospace", fontWeight: 600 }}>{fmt(p.market_value)}</td>
                        <td style={{ padding: "10px 12px", color: COLORS.muted }}>{p.currency}</td>
                        <td style={{ padding: "10px 12px", color: COLORS.muted, fontFamily: "monospace" }}>{p.pd ? (p.pd * 100).toFixed(1) + "%" : "—"}</td>
                        <td style={{ padding: "10px 12px", color: COLORS.muted, fontFamily: "monospace" }}>{p.lgd ? (p.lgd * 100).toFixed(0) + "%" : "—"}</td>
                        <td style={{ padding: "10px 12px", color: COLORS.muted, fontFamily: "monospace" }}>{p.beta ? `β${p.beta}` : p.duration ? `D${p.duration}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* SCENARIOS TAB */}
        {tab === "scenarios" && (
          <div>
            <div style={{ marginBottom: 28 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Scenario Configuration</h1>
              <p style={{ color: COLORS.muted, margin: "4px 0 0", fontSize: 13 }}>Select a predefined scenario or build a custom one</p>
            </div>

            {/* Scenario type toggle */}
            <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
              {[false, true].map(v => (
                <button key={String(v)} onClick={() => setUseCustom(v)} style={{
                  background: useCustom === v ? "#1e293b" : "transparent",
                  border: `1px solid ${useCustom === v ? COLORS.accent : COLORS.border}`,
                  color: useCustom === v ? COLORS.accent : COLORS.muted,
                  padding: "8px 18px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600,
                }}>
                  {v ? "⚙️ Custom Scenario" : "📚 Predefined Scenarios"}
                </button>
              ))}
            </div>

            {!useCustom && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 28 }}>
                {PREDEFINED_SCENARIOS.map(sc => (
                  <div key={sc.id} onClick={() => setSelectedScenarioId(sc.id)} style={{
                    background: selectedScenarioId === sc.id ? "#1e293b" : COLORS.card,
                    border: `1px solid ${selectedScenarioId === sc.id ? COLORS.accent : COLORS.border}`,
                    borderRadius: 12, padding: 20, cursor: "pointer",
                    transition: "all 0.15s",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{sc.name}</div>
                      <Badge text={sc.severity} color={SEVERITY_COLOR[sc.severity]} />
                    </div>
                    <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 12 }}>
                      {SCENARIO_SHOCKS[sc.id]?.shocks.length} shock factors applied
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {SCENARIO_SHOCKS[sc.id]?.shocks.map((s, i) => (
                        <span key={i} style={{
                          background: "#0f172a", border: `1px solid ${COLORS.border}`,
                          borderRadius: 4, padding: "2px 8px", fontSize: 11, fontFamily: "monospace",
                          color: s.magnitude < 0 ? COLORS.loss : COLORS.gain,
                        }}>
                          {s.shock_type} {(s.magnitude * 100).toFixed(0)}%
                        </span>
                      ))}
                    </div>
                    {selectedScenarioId === sc.id && (
                      <div style={{ marginTop: 12, fontSize: 11, color: COLORS.accent, fontWeight: 600 }}>✓ Selected</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {useCustom && (
              <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 24, marginBottom: 24 }}>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontSize: 12, color: COLORS.muted, marginBottom: 6 }}>Scenario Name</label>
                  <input value={customName} onChange={e => setCustomName(e.target.value)} style={{
                    background: "#0f172a", border: `1px solid ${COLORS.border}`, color: COLORS.text,
                    borderRadius: 8, padding: "8px 12px", fontSize: 13, width: "100%", maxWidth: 400,
                  }} />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 8 }}>Shock Parameters</div>
                  {customShocks.map((s, i) => (
                    <div key={i} style={{ display: "flex", gap: 12, marginBottom: 10, alignItems: "center" }}>
                      <select value={s.shock_type} onChange={e => {
                        const ns = [...customShocks]; ns[i] = { ...ns[i], shock_type: e.target.value }; setCustomShocks(ns);
                      }} style={{ background: "#0f172a", border: `1px solid ${COLORS.border}`, color: COLORS.text, borderRadius: 6, padding: "6px 10px", fontSize: 12 }}>
                        {SHOCK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <input type="range" min={-60} max={30} value={s.magnitude * 100}
                        onChange={e => { const ns = [...customShocks]; ns[i] = { ...ns[i], magnitude: parseFloat(e.target.value) / 100 }; setCustomShocks(ns); }}
                        style={{ flex: 1 }} />
                      <span style={{ fontFamily: "monospace", fontSize: 13, color: s.magnitude < 0 ? COLORS.loss : COLORS.gain, minWidth: 50 }}>
                        {fmtPct(s.magnitude * 100)}
                      </span>
                      <button onClick={() => setCustomShocks(customShocks.filter((_, j) => j !== i))} style={{
                        background: "transparent", border: "none", color: COLORS.loss, cursor: "pointer", fontSize: 16,
                      }}>×</button>
                    </div>
                  ))}
                  <button onClick={() => setCustomShocks([...customShocks, { shock_type: "equity", magnitude: -0.10 }])} style={{
                    background: "#1e293b", border: `1px solid ${COLORS.border}`, color: COLORS.text,
                    padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, marginTop: 4,
                  }}>+ Add Shock</button>
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={runTest} disabled={isRunning} style={{
                background: "linear-gradient(135deg, #f59e0b, #ef4444)",
                border: "none", color: "#000", padding: "12px 28px",
                borderRadius: 8, cursor: isRunning ? "not-allowed" : "pointer",
                fontSize: 14, fontWeight: 700, letterSpacing: "0.02em",
                opacity: isRunning ? 0.7 : 1,
              }}>
                {isRunning ? "⏳ Running..." : "⚡ Run Stress Test"}
              </button>
              <button onClick={runBatch} disabled={isRunning} style={{
                background: "#1e293b", border: `1px solid ${COLORS.border}`, color: COLORS.text,
                padding: "12px 28px", borderRadius: 8, cursor: isRunning ? "not-allowed" : "pointer",
                fontSize: 14, fontWeight: 600,
              }}>
                🔁 Run All Scenarios
              </button>
            </div>
          </div>
        )}

        {/* RESULTS TAB */}
        {tab === "results" && result && (
          <div>
            <div style={{ marginBottom: 28 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
                Results: <span style={{ color: COLORS.primary }}>{result.scenario_name}</span>
              </h1>
              <p style={{ color: COLORS.muted, margin: "4px 0 0", fontSize: 13 }}>
                Portfolio impact analysis and risk metrics
              </p>
            </div>

            {/* KPI grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
              <MetricCard label="Total Loss" value={fmt(result.total_loss)} sub={fmtPct(-result.total_loss_pct)} color={COLORS.loss} icon="📉" />
              <MetricCard label="Stressed Value" value={fmt(result.total_stressed_value)} sub={`Base: ${fmt(result.total_base_value)}`} icon="💰" />
              <MetricCard label="Expected Loss" value={fmt(result.total_expected_loss)} sub="PD × LGD × EAD" color={COLORS.primary} icon="⚠️" />
              <MetricCard label="VaR 99%" value={fmt(result.var_99)} sub={`ES 95%: ${fmt(result.es_95)}`} color={COLORS.accent} icon="📐" />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 20, marginBottom: 20 }}>
              {/* Loss by asset class bar */}
              <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 20 }}>
                <SectionHeader title="Loss by Asset Class" sub="Absolute stressed losses per class" />
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={Object.entries(result.loss_by_asset_class).map(([k, v]) => ({ name: k, loss: v }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
                    <XAxis dataKey="name" tick={{ fill: COLORS.muted, fontSize: 11 }} />
                    <YAxis tick={{ fill: COLORS.muted, fontSize: 11 }} tickFormatter={v => fmt(v)} />
                    <Tooltip formatter={fmt} contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8 }} />
                    <Bar dataKey="loss" radius={[4, 4, 0, 0]}>
                      {Object.keys(result.loss_by_asset_class).map((k, i) => (
                        <Cell key={i} fill={ASSET_COLORS[k] || COLORS.loss} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Risk metrics radar */}
              <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 20 }}>
                <SectionHeader title="Risk Profile" sub="Normalised risk dimensions" />
                <ResponsiveContainer width="100%" height={220}>
                  <RadarChart data={[
                    { subject: "Market Loss", A: result.total_loss_pct },
                    { subject: "Exp. Loss", A: (result.total_expected_loss / result.total_base_value) * 100 * 10 },
                    { subject: "VaR 95", A: (result.var_95 / result.total_base_value) * 100 },
                    { subject: "VaR 99", A: (result.var_99 / result.total_base_value) * 100 },
                    { subject: "ES 95", A: (result.es_95 / result.total_base_value) * 100 },
                  ]}>
                    <PolarGrid stroke={COLORS.border} />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: COLORS.muted, fontSize: 10 }} />
                    <PolarRadiusAxis tick={false} />
                    <Radar name="Risk" dataKey="A" stroke={COLORS.primary} fill={COLORS.primary} fillOpacity={0.2} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Position results table */}
            <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 20 }}>
              <SectionHeader title="Position-Level Results" sub="Detailed impact per position" />
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    {["Position", "Asset Class", "Base MV", "Stressed MV", "Loss ($)", "Loss (%)", "Exp. Loss"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, color: COLORS.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.position_results.map((r, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${COLORS.border}22` }}>
                      <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 12, color: COLORS.accent }}>{r.position_id}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ background: (ASSET_COLORS[r.asset_class] || "#64748b") + "22", color: ASSET_COLORS[r.asset_class] || "#64748b", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{r.asset_class}</span>
                      </td>
                      <td style={{ padding: "10px 12px", fontFamily: "monospace" }}>{fmt(r.base_value)}</td>
                      <td style={{ padding: "10px 12px", fontFamily: "monospace" }}>{fmt(r.stressed_value)}</td>
                      <td style={{ padding: "10px 12px", fontFamily: "monospace", color: COLORS.loss, fontWeight: 600 }}>-{fmt(r.absolute_loss)}</td>
                      <td style={{ padding: "10px 12px", fontFamily: "monospace", color: COLORS.loss }}>{r.percentage_loss.toFixed(2)}%</td>
                      <td style={{ padding: "10px 12px", fontFamily: "monospace", color: COLORS.primary }}>{fmt(r.expected_loss)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "results" && !result && (
          <div style={{ textAlign: "center", padding: "80px 0", color: COLORS.muted }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚡</div>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No results yet</div>
            <div>Go to Scenarios tab and run a stress test first.</div>
          </div>
        )}

        {/* BATCH TAB */}
        {tab === "batch" && batchResults && (
          <div>
            <div style={{ marginBottom: 28 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Scenario Comparison</h1>
              <p style={{ color: COLORS.muted, margin: "4px 0 0", fontSize: 13 }}>All scenarios run against current portfolio</p>
            </div>

            {/* Comparative bar */}
            <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 20, marginBottom: 20 }}>
              <SectionHeader title="Portfolio Loss by Scenario" sub="Total stressed loss ($)" />
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={batchResults.map(r => ({ name: r.scenario_name.split(" ").slice(0, 3).join(" "), loss: r.total_loss, pct: r.total_loss_pct }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
                  <XAxis dataKey="name" tick={{ fill: COLORS.muted, fontSize: 10 }} />
                  <YAxis tick={{ fill: COLORS.muted, fontSize: 11 }} tickFormatter={fmt} />
                  <Tooltip formatter={fmt} contentStyle={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 8 }} />
                  <Bar dataKey="loss" fill={COLORS.loss} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Comparison table */}
            <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 20 }}>
              <SectionHeader title="Scenario Comparison Table" />
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                    {["Scenario", "Severity", "Total Loss", "Loss %", "Exp. Loss", "VaR 95%", "VaR 99%", "ES 95%"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, color: COLORS.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {batchResults.sort((a, b) => b.total_loss - a.total_loss).map((r, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${COLORS.border}22` }}>
                      <td style={{ padding: "10px 12px", fontWeight: 600 }}>{r.scenario_name}</td>
                      <td style={{ padding: "10px 12px" }}><Badge text={r.severity || "—"} color={SEVERITY_COLOR[r.severity] || COLORS.muted} /></td>
                      <td style={{ padding: "10px 12px", fontFamily: "monospace", color: COLORS.loss, fontWeight: 600 }}>-{fmt(r.total_loss)}</td>
                      <td style={{ padding: "10px 12px", fontFamily: "monospace", color: COLORS.loss }}>{r.total_loss_pct.toFixed(2)}%</td>
                      <td style={{ padding: "10px 12px", fontFamily: "monospace", color: COLORS.primary }}>{fmt(r.total_expected_loss)}</td>
                      <td style={{ padding: "10px 12px", fontFamily: "monospace" }}>{fmt(r.var_95)}</td>
                      <td style={{ padding: "10px 12px", fontFamily: "monospace" }}>{fmt(r.var_99)}</td>
                      <td style={{ padding: "10px 12px", fontFamily: "monospace" }}>{fmt(r.es_95)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "batch" && !batchResults && (
          <div style={{ textAlign: "center", padding: "80px 0", color: COLORS.muted }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🔁</div>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>No batch results yet</div>
            <div>Go to Scenarios tab and click "Run All Scenarios".</div>
          </div>
        )}

      </div>
    </div>
  );
}
