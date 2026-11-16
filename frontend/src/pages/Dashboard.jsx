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

export function Dashboard() {
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  useEffect(() => {
    Promise.all([
      api.get("/evaluation").catch(() => null),
      api.get("/model_info").catch(() => null),
      api.get("/history").catch(() => ({ items: [] })),
      api.get("/dataset").catch(() => null),
    ])
      .then(([evaluation, model, hist, dataset]) => setData({ evaluation, model, dataset }))
      .catch(() => {});
    api
      .get("/history")
      .then((r) => setHistory(r.items.slice(0, 7)))
      .catch(() => {});
  }, []);
  const { user } = useAuth();
  const model = data?.model?.metadata;
  const ds = data?.dataset;
  const cv = data?.evaluation?.validation?.study_grouped_nested_5_fold?.[model?.algorithm]?.metrics;
  const points = history
    .slice()
    .reverse()
    .map((x, i) => ({ n: i + 1, capacity: x.result.capacity_mg_g, date: x.created_at?.slice(0, 10) }));
  return (
    <>
      <SectionTitle
        eyebrow="YOUR RESEARCH OVERVIEW"
        title={`Good to see you, ${user?.username || "researcher"}`}
        desc="A grounded view of your MgO adsorption workbench."
        right={
          <a className="btn primary" href="/predict">
            <FlaskConical size={17} /> New prediction
          </a>
        }
      />
      <div className="metric-grid">
        <Metric label="Total predictions" value={history.length} sub="Saved in your personal history" />
        <Metric label="Active model" value={model?.algorithm || "Unavailable"} sub={data?.model?.version || "Train and deploy a model"} />
        <Metric label="Grouped CV · R²" value={cv ? cv.r2.toFixed(3) : "—"} sub="Unseen-study validation" accent="blue" />
        <Metric
          label="Grouped RMSE"
          value={cv ? cv.rmse_mmol_g.toFixed(2) : "—"}
          unit="mmol/g"
          sub={cv ? `${cv.rmse_mg_g.toFixed(1)} mg/g in source units` : ""}
          accent="amber"
        />
      </div>
      <div className="grid-two dashboard-panels">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Recent prediction trend</h2>
              <p>Saved predictions · mg/g</p>
            </div>
            <a href="/history">
              View history <ChevronRight size={14} />
            </a>
          </div>
          {points.length ? (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={points}>
                <defs>
                  <linearGradient id="fillC" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--c1)" stopOpacity={0.42} />
                    <stop offset="100%" stopColor="var(--c1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="var(--line)" />
                <XAxis dataKey="n" tickLine={false} axisLine={false} height={42} label={{ value: "Prediction #", position: "insideBottom", offset: 0 }} />
                <YAxis tickLine={false} axisLine={false} width={56} label={{ value: "mg/g", angle: -90, position: "insideLeft", offset: 12 }} />
                <Tooltip cursor={{ stroke: "var(--c1)", strokeOpacity: 0.4, strokeDasharray: "4 4" }} />
                <Area
                  dataKey="capacity"
                  name="Capacity (mg/g)"
                  type="monotone"
                  stroke="var(--c1)"
                  fill="url(#fillC)"
                  strokeWidth={3}
                  dot={{ r: 3.5, fill: "var(--surface)", stroke: "var(--c1)", strokeWidth: 2 }}
                  activeDot={{ r: 6 }}
                  animationDuration={1400}
                  animationEasing="ease-out"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <Empty text="Your prediction history will appear here." />
          )}
        </section>
        <section className="panel model-panel">
          <div className="panel-heading">
            <div>
              <h2>Model health</h2>
              <p>Deployed artifact status</p>
            </div>
            <span className={"status-pill " + (data?.model?.loaded ? "ok" : "warn")}>
              {data?.model?.loaded ? "● Online" : "● Unavailable"}
            </span>
          </div>
          <div className="model-version">
            <span className="model-glyph">
              <Activity />
            </span>
            <div>
              <b>{model?.algorithm || "No active model"}</b>
              <small>{data?.model?.version || "Model artifact not found"}</small>
            </div>
          </div>
          <div className="kv-row">
            <span>Training observations</span>
            <b>{ds?.valid_target_and_study_rows ?? "—"}</b>
          </div>
          <div className="kv-row">
            <span>Research studies</span>
            <b>{ds?.study_count ?? "—"}</b>
          </div>
          <div className="kv-row">
            <span>Model trained (UTC)</span>
            <b>{model?.trained_at_utc?.slice(0, 10) || "—"}</b>
          </div>
          <a className="btn secondary wide" href="/analysis">
            Open model analysis <ArrowRight size={16} />
          </a>
        </section>
      </div>
      <section className="panel recent-table">
        <div className="panel-heading">
          <div>
            <h2>Latest activity</h2>
            <p>Your most recent capacity estimates</p>
          </div>
          <a href="/history">
            All predictions <ChevronRight size={14} />
          </a>
        </div>
        {history.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Prediction ID</th>
                  <th>Capacity</th>
                  <th>Model</th>
                  <th>Created</th>
                  <th>Distribution</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 5).map((x) => (
                  <tr key={x.id}>
                    <td className="mono">{x.id.slice(0, 12)}</td>
                    <td>
                      <b>{x.result.capacity_mg_g.toFixed(1)} mg/g</b>
                      <small className="subvalue">{x.result.capacity_mmol_g.toFixed(2)} mmol/g</small>
                    </td>
                    <td>{x.result.model_version}</td>
                    <td>{new Date(x.created_at).toLocaleDateString()}</td>
                    <td>
                      {x.result.ood_warning ? (
                        <span className="status-pill warn">Outside observed range</span>
                      ) : (
                        <span className="status-pill ok">Within feature ranges</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text="No saved predictions yet. Run your first prediction to start a history." />
        )}
      </section>
    </>
  );
}
