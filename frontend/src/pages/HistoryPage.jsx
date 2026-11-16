import React, { useEffect, useState } from "react";
import {
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
  Metric,
  SectionTitle,
  Loading,
  Empty,
  inputDefaults,
  numFields,
  fieldBounds,
} from "../components/shared";

export function HistoryPage() {
  const [items, setItems] = useState([]),
    [q, setQ] = useState(""),
    [open, setOpen] = useState(null),
    [error, setError] = useState("");
  const load = () =>
    api
      .get(`/history?q=${encodeURIComponent(q)}`)
      .then((r) => setItems(r.items))
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  const del = async (id) => {
    if (!confirm("Delete this prediction from your history?")) return;
    try {
      await api.delete(`/history/${id}`);
      load();
    } catch (e) {
      setError(e.message);
    }
  };
  const rerun = (x) => {
    sessionStorage.setItem("prefill", JSON.stringify(x.inputs));
    location.href = "/predict";
  };
  return (
    <>
      <SectionTitle
        eyebrow="PERSONAL RECORDS"
        title="Prediction history"
        desc="Search and revisit your saved predictions. Your history is private to your account."
      />
      <div className="panel">
        <div className="history-tools">
          <div className="search-box">
            <Search size={16} />
            <input
              placeholder="Search inputs, model or prediction ID…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
            />
          </div>
          <button className="btn secondary" onClick={load}>
            <Search size={15} /> Search
          </button>
          <button className="btn ghost" onClick={load}>
            <RefreshCw size={15} />
          </button>
        </div>
        {error && <div className="alert danger">{error}</div>}
        {items.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Prediction</th>
                  <th>Capacity</th>
                  <th>Prediction interval</th>
                  <th>Confidence</th>
                  <th>Model</th>
                  <th>Date</th>
                  <th>OOD</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((x) => (
                  <tr key={x.id}>
                    <td className="mono">{x.id.slice(0, 13)}</td>
                    <td>
                      <b>{x.result.capacity_mg_g.toFixed(1)} mg/g</b>
                      <small className="subvalue">{x.result.capacity_mmol_g.toFixed(2)} mmol/g</small>
                    </td>
                    <td>
                      {x.result.uncertainty
                        ? `${x.result.uncertainty.lower_mg_g.toFixed(0)}–${x.result.uncertainty.upper_mg_g.toFixed(0)} mg/g`
                        : "Unavailable"}
                    </td>
                    <td>
                      {x.result.uncertainty ? (
                        <span
                          className={`status-pill ${x.result.confidence_flag === "high" ? "ok" : x.result.confidence_flag === "medium" ? "warn" : "danger"}`}
                        >
                          {x.result.confidence_flag}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{x.result.model_version}</td>
                    <td>{new Date(x.created_at).toLocaleString()}</td>
                    <td>
                      {x.result.ood_warning ? <span className="status-pill warn">Review</span> : <span className="status-pill ok">OK</span>}
                    </td>
                    <td className="action-cell">
                      <button title="Details" onClick={() => setOpen(x)}>
                        <Eye size={16} />
                      </button>
                      <button title="Rerun" onClick={() => rerun(x)}>
                        <RefreshCw size={16} />
                      </button>
                      <button title="Delete" onClick={() => del(x.id)}>
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text="No predictions found. Try another search or create a prediction." />
        )}
      </div>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setOpen(null)}>
              ×
            </button>
            <span className="eyebrow">PREDICTION DETAILS</span>
            <h2>
              {open.result.capacity_mg_g.toFixed(1)} mg/g <small>· {open.result.capacity_mmol_g.toFixed(2)} mmol/g</small>
            </h2>
            <p className="mono">{open.id}</p>
            {open.result.uncertainty ? (
              <div className="mini-note">
                {Math.round(open.result.uncertainty.confidence_level * 100)}% prediction interval:{" "}
                {open.result.uncertainty.lower_mg_g.toFixed(1)}–{open.result.uncertainty.upper_mg_g.toFixed(1)} mg/g ·{" "}
                {open.result.confidence_flag} confidence
              </div>
            ) : (
              <div className="mini-note">
                Prediction interval unavailable: {open.result.uncertainty_message || "model has no calibration"}
              </div>
            )}
            <h3>Input record</h3>
            <pre>{JSON.stringify(open.inputs, null, 2)}</pre>
            <button className="btn primary" onClick={() => rerun(open)}>
              Rerun with these inputs <ArrowRight size={15} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
