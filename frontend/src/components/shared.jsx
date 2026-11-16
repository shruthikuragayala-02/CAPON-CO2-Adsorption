import React, { useEffect, useMemo, useRef, useState } from "react";
import { api, apiBase } from "../services/api";
import { useAuth } from "../context/AuthContext";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Beaker,
  CheckCircle2,
  ChevronRight,
  Database,
  FlaskConical,
  Info,
  Loader2,
  LockKeyhole,
  Play,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Upload,
  Users,
  Workflow,
  AlertTriangle,
  Trash2,
  Eye,
  EyeOff,
} from "lucide-react";
export const inputDefaults = {
  active_pct: 85,
  active_component: "MgO",
  precursor: "Mg(NO3)2·6H2O",
  promoter: "NaNO3",
  ratio: "1",
  synthesis_method: "Impregnation",
  pretreatment_gas: "N2",
  pretreatment_flow: 100,
  pretreatment_temperature: 400,
  pretreatment_time: 30,
  adsorption_gas: "CO2",
  co2_percentage: 100,
  adsorption_flow: 80,
  adsorption_temperature: 300,
  adsorption_time: 120,
  surface_area: 100,
  pore_volume: 0.5,
  pore_size: 20,
  application: "Fixed bed",
};
export const numFields = [
  ["active_pct", "MgO / active component", "%"],
  ["pretreatment_flow", "Pretreatment flow", ""],
  ["pretreatment_temperature", "Pretreatment temperature", "°C"],
  ["pretreatment_time", "Pretreatment time", "min"],
  ["co2_percentage", "Adsorption CO₂", "%"],
  ["adsorption_flow", "Adsorption flow", ""],
  ["adsorption_temperature", "Adsorption temperature", "°C"],
  ["adsorption_time", "Adsorption time", "min"],
  ["surface_area", "Surface area", "m²/g"],
  ["pore_volume", "Pore volume", "cm³/g"],
  ["pore_size", "Pore size", "nm"],
];
export const fieldBounds = {
  active_pct: [0, 100],
  pretreatment_flow: [20, 200],
  pretreatment_temperature: [200, 500],
  pretreatment_time: [30, 60],
  co2_percentage: [10, 100],
  adsorption_flow: [40, 110],
  adsorption_temperature: [200, 400],
  adsorption_time: [10, 240],
  surface_area: [0, 672],
  pore_volume: [0, 2.19],
  pore_size: [0, 157.9],
};
const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Counts a numeric value up from 0 (ease-out). Non-numeric values render as-is. */
export function AnimatedNumber({ value, duration = 900 }) {
  const text = String(value);
  const isNum = /^-?\d+(\.\d+)?$/.test(text);
  const target = isNum ? Number(text) : 0;
  const decimals = isNum ? (text.split(".")[1] || "").length : 0;
  const [shown, setShown] = useState(isNum && !prefersReducedMotion() ? 0 : target);
  const raf = useRef(0);
  useEffect(() => {
    if (!isNum || prefersReducedMotion()) {
      setShown(target);
      return undefined;
    }
    let start;
    const step = (ts) => {
      start = start ?? ts;
      const p = Math.min(1, (ts - start) / duration);
      setShown(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [target, isNum, duration]);
  return isNum ? shown.toFixed(decimals) : text;
}

/** Decorative circular gauge for a capacity value (mg/g), drawn against a 500 mg/g reference scale. */
export function CapacityRing({ value, scale = 500 }) {
  const frac = Math.max(0.03, Math.min(1, (Number(value) || 0) / scale));
  const circ = 2 * Math.PI * 42;
  return (
    <div className="cap-ring" aria-hidden="true">
      <svg viewBox="0 0 100 100">
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#14b8a6" />
            <stop offset="100%" stopColor="#4cc364" />
          </linearGradient>
        </defs>
        <circle className="ring-track" cx="50" cy="50" r="42" />
        <circle className="ring-fill" cx="50" cy="50" r="42" style={{ "--circ": circ.toFixed(2), "--off": (circ * (1 - frac)).toFixed(2) }} />
      </svg>
      <span>CO₂</span>
    </div>
  );
}

export function Metric({ label, value, unit, sub, accent = "mint" }) {
  return (
    <div className="metric-card">
      <div className="metric-top">
        <span>{label}</span>
        <span className={"metric-dot " + accent} />
      </div>
      <strong>
        {value == null ? "—" : <AnimatedNumber value={value} />} <small>{unit}</small>
      </strong>
      {sub && <p>{sub}</p>}
    </div>
  );
}
export function SectionTitle({ eyebrow, title, desc, right }) {
  return (
    <div className="section-title">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {desc && <p>{desc}</p>}
      </div>
      {right}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading-skeleton" role="status" aria-live="polite">
      <div className="skeleton-row">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton card" />
        ))}
      </div>
      <div className="skeleton block" />
      <span className="loading-text">
        <Loader2 className="spin" size={16} /> Loading platform data…
      </span>
    </div>
  );
}
export function Empty({ text }) {
  return (
    <div className="empty">
      <Database size={22} />
      <span>{text}</span>
    </div>
  );
}

export {
  api,
  apiBase,
  useAuth,
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  Legend,
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Beaker,
  CheckCircle2,
  ChevronRight,
  Database,
  FlaskConical,
  Info,
  Loader2,
  LockKeyhole,
  Play,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Upload,
  Users,
  Workflow,
  AlertTriangle,
  Trash2,
  Eye,
  EyeOff,
};
