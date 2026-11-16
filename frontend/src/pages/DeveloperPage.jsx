import React, { useEffect, useMemo, useState } from "react";
import { Cell } from "recharts";
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
const jobResult = (j) => {
  try {
    return JSON.parse(j.result_json || "{}");
  } catch {
    return {};
  }
};

export function DeveloperPage() {
  const [tab, setTab] = useState("overview"),
    [overview, setOverview] = useState(null),
    [data, setData] = useState(null),
    [versions, setVersions] = useState([]),
    [users, setUsers] = useState([]),
    [models, setModels] = useState([]),
    [jobs, setJobs] = useState([]),
    [logs, setLogs] = useState([]),
    [options, setOptions] = useState(null),
    [missing, setMissing] = useState(null),
    [err, setErr] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = async () => {
    setErr("");
    try {
      const o = await api.get("/developer/overview");
      setOverview(o);
      const d = await api.get("/developer/dataset/preview");
      setData(d);
      api.get("/train/options").then(setOptions).catch(() => {});
      api.get("/developer/dataset/missing").then(setMissing).catch(() => {});
      const [v, u, m, j, l] = await Promise.all([
        api.get("/developer/dataset/versions"),
        api.get("/developer/users"),
        api.get("/developer/models"),
        api.get("/train/history"),
        api.get("/developer/audit"),
      ]);
      setVersions(v.versions);
      setUsers(u.users);
      setModels(m.models);
      setJobs(j.jobs);
      setLogs(l.events);
    } catch (e) {
      setErr(e.message);
    }
  };
  useEffect(() => {
    refresh();
  }, []);
  useEffect(() => {
    if (tab !== "training") return;
    const id = setInterval(
      () =>
        api
          .get("/train/status")
          .then((r) => setJobs(r.jobs))
          .catch(() => {}),
      2500,
    );
    return () => clearInterval(id);
  }, [tab]);
  const [file, setFile] = useState(null);
  const [trials, setTrials] = useState(50),
    [quick, setQuick] = useState(false),
    [pickedModels, setPickedModels] = useState(null), // null = compare every available model
    [imputation, setImputation] = useState("median"),
    [indicator, setIndicator] = useState(true),
    [seed, setSeed] = useState(42),
    [level, setLevel] = useState(0.9),
    [timeCap, setTimeCap] = useState("");
  const modelList = options?.models || [];
  const availableIds = modelList.filter((m) => m.available).map((m) => m.id);
  const activeModels = pickedModels ?? availableIds;
  const toggleModel = (id) => {
    const cur = pickedModels ?? availableIds;
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    setPickedModels(next.length === availableIds.length ? null : next);
  };
  const effTrials = quick ? 10 : trials;
  const totalTrials = activeModels.length * 5 * effTrials + effTrials; // 5 outer folds per model + final study
  const imputeInfo = options?.imputation?.find((x) => x.id === imputation);
  const PRESETS = [
    ["Fast preview", "One model, median fill, 10 trials", () => { setPickedModels(["RandomForest"]); setImputation("median"); setQuick(true); }],
    ["Balanced", "Compare all, median fill, 25 trials", () => { setPickedModels(null); setImputation("median"); setQuick(false); setTrials(25); }],
    ["Thorough", "Compare all, KNN fill, 50 trials", () => { setPickedModels(null); setImputation("knn"); setQuick(false); setTrials(50); }],
  ];
  const missingChart = useMemo(() => (missing?.items || []).slice(0, 10).map((x) => ({ name: x.feature, pct: x.pct })), [missing]);
  const [devPw, setDevPw] = useState({ current_password: "", new_password: "" });
  const [uploadNotice, setUploadNotice] = useState("");
  const upload = async (mode) => {
    if (!file) return;
    setBusy(true);
    try {
      await api.upload("/developer/dataset/upload", file, `?mode=${mode}`);
      await refresh();
      setFile(null);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const train = async () => {
    setBusy(true);
    try {
      if (!activeModels.length) throw new Error("Select at least one model to train.");
      await api.post("/train", {
        trials: Number(trials),
        quick,
        seed: Number(seed) || 42,
        alpha: Number((1 - level).toFixed(2)),
        models: pickedModels,
        imputation,
        missing_indicator: indicator,
        timeout_seconds: timeCap ? Number(timeCap) : null,
      });
      await refresh();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const deploy = async (version) => {
    if (!confirm(`Deploy model ${version}? This replaces the active model after confirmation.`)) return;
    try {
      await api.post("/developer/deploy", { version, confirm: true });
      await refresh();
    } catch (e) {
      setErr(e.message);
    }
  };
  const disable = async (u) => {
    try {
      await api.post(`/developer/users/${u.id}/disable?disabled=${!u.disabled}`, {});
      await refresh();
    } catch (e) {
      setErr(e.message);
    }
  };
  const updateDevPassword = async (e) => {
    e.preventDefault();
    setErr("");
    setUploadNotice("");
    try {
      const r = await api.post("/developer/change-password", devPw);
      setUploadNotice(r.message);
      setDevPw({ current_password: "", new_password: "" });
    } catch (x) {
      setErr(x.message);
    }
  };
  const tabs = [
    ["overview", "Overview"],
    ["dataset", "Dataset"],
    ["training", "Training"],
    ["models", "Models"],
    ["users", "Users"],
    ["audit", "Audit log"],
    ["security", "Security"],
  ];
  return (
    <>
      <SectionTitle
        eyebrow="RESTRICTED ADMINISTRATION"
        title="Developer console"
        desc="Dataset versioning, model jobs, deployment and access administration."
        right={
          <span className="status-pill ok">
            <ShieldCheck size={14} /> Developer access
          </span>
        }
      />
      {err && <div className="alert danger">{err}</div>}
      <div className="dev-tabs">
        {tabs.map(([id, l]) => (
          <button className={tab === id ? "active" : ""} key={id} onClick={() => setTab(id)}>
            {l}
          </button>
        ))}
      </div>
      <div className="tab-pane" key={tab}>
      {tab === "overview" && (
        <>
          <div className="metric-grid">
            <Metric label="Dataset rows" value={overview?.dataset?.n_samples ?? overview?.dataset?.valid_target_and_study_rows ?? "—"} />
            <Metric label="Studies" value={overview?.dataset?.n_studies ?? overview?.dataset?.study_count ?? "—"} />
            <Metric label="Registered accounts" value={overview?.users ?? "—"} />
            <Metric label="Active artifact" value={overview?.active_model || "Not available"} accent="blue" />
          </div>
          <div className="grid-two">
            <div className="panel">
              <h2>System status</h2>
              <div className="kv-row">
                <span>API</span>
                <b className="green">Healthy</b>
              </div>
              <div className="kv-row">
                <span>Model artifact</span>
                <b>{overview?.model_loaded ? "Loaded" : "Missing"}</b>
              </div>
              <div className="kv-row">
                <span>Active algorithm</span>
                <b>{overview?.active_algorithm || "—"}</b>
              </div>
              <div className="kv-row">
                <span>Missing-value fill</span>
                <b>{overview?.active_config?.imputation || "median (legacy)"}</b>
              </div>
              <div className="kv-row">
                <span>Last training</span>
                <b>{jobs?.[0]?.created_at || "—"}</b>
              </div>
              <button className="btn secondary" onClick={refresh}>
                <RefreshCw size={15} /> Refresh system
              </button>
            </div>
            <div className="panel">
              <h2>Recent training jobs</h2>
              {jobs?.slice(0, 5).map((j) => (
                <div className="kv-row" key={j.id}>
                  <span className="mono">{j.id.slice(0, 8)}</span>
                  <span className="status-pill">{j.status}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      {tab === "dataset" && (
        <>
          <div className="grid-two">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Dataset versioning</h2>
                  <p>Uploads are versioned and never silently discarded.</p>
                </div>
                <Database />
              </div>
              <label className="dropzone">
                <input type="file" accept=".csv,.xlsx" onChange={(e) => setFile(e.target.files[0])} />
                <Upload />
                <b>{file?.name || "Select source-schema CSV / Excel"}</b>
                <small>41+ columns, raw records; target at index 21 and Study ID at 40.</small>
              </label>
              <div className="inline-buttons">
                <button className="btn primary" disabled={!file || busy} onClick={() => upload("replace")}>
                  Replace current
                </button>
                <button className="btn secondary" disabled={!file || busy} onClick={() => upload("append")}>
                  Append records
                </button>
              </div>
              <h3>Dataset versions</h3>
              {versions.map((v) => (
                <div className="version-row" key={v.id}>
                  <div>
                    <b>{v.version}</b>
                    <small>
                      {v.row_count} rows · {v.created_at}
                    </small>
                  </div>
                  <button
                    className="btn ghost"
                    onClick={async () => {
                      if (confirm("Restore this dataset version?")) {
                        await api.post(`/developer/dataset/rollback/${v.version}`, {});
                        refresh();
                      }
                    }}
                  >
                    Restore
                  </button>
                </div>
              ))}
            </section>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Data preview</h2>
                  <p>{data?.count ?? 0} current rows · showing first 50</p>
                </div>
              </div>
              <div className="table-scroll data-preview">
                <table>
                  <tbody>
                    {data?.rows?.slice(0, 12).map((r, i) => (
                      <tr key={i}>
                        {r.slice(0, 8).map((x, j) => (
                          <td key={j}>{String(x).slice(0, 26)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="caption">Preview columns are raw source columns 0–7. No outlier is auto-deleted.</div>
            </section>
          </div>
        </>
      )}
      {tab === "training" && (
        <>
          <div className="grid-two train-grid">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Train a candidate</h2>
                  <p>Study-grouped nested cross-validation · choose the model and how gaps are filled</p>
                </div>
                <Beaker />
              </div>
              <div className="alert warning">
                The deployed model remains active while training. A candidate must be explicitly deployed afterward.
              </div>

              <div className="preset-row" role="group" aria-label="Training presets">
                {PRESETS.map(([name, hint, apply]) => (
                  <button type="button" key={name} className="preset" onClick={apply} title={hint}>
                    <b>{name}</b>
                    <small>{hint}</small>
                  </button>
                ))}
              </div>

              <div className="field-label">
                1 · Model{" "}
                <button type="button" className="link-btn" onClick={() => setPickedModels(null)}>
                  Select all
                </button>
              </div>
              <div className="model-picker" role="group" aria-label="Models to train">
                {modelList.map((m) => {
                  const on = activeModels.includes(m.id);
                  return (
                    <button
                      type="button"
                      key={m.id}
                      disabled={!m.available}
                      aria-pressed={on}
                      className={"model-chip" + (on ? " on" : "")}
                      onClick={() => toggleModel(m.id)}
                      title={m.available ? m.description : "Not installed on the server"}
                    >
                      <CheckCircle2 size={15} />
                      <span>
                        <b>{m.label}</b>
                        <small>{m.available ? m.description : "Not installed"}</small>
                      </span>
                    </button>
                  );
                })}
                {!modelList.length && <Empty text="Model options unavailable. Check the API connection." />}
              </div>
              <p className="caption">
                {activeModels.length === 1
                  ? `Only ${activeModels[0]} is trained, so it becomes the candidate. This is also the fastest option.`
                  : `${activeModels.length} models are compared; the lowest study-grouped RMSE becomes the candidate.`}
              </p>

              <div className="field-label">2 · Missing values</div>
              <label>
                Fill strategy
                <select value={imputation} onChange={(e) => setImputation(e.target.value)}>
                  {(options?.imputation || [{ id: "median", label: "Median" }]).map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.label}
                    </option>
                  ))}
                </select>
              </label>
              {imputeInfo && <p className="caption impute-note" key={imputation}>{imputeInfo.description}</p>}
              <label className="toggle-line">
                <input type="checkbox" checked={indicator} onChange={(e) => setIndicator(e.target.checked)} /> Add “was missing” indicator columns (recommended)
              </label>

              <div className="field-label">3 · Search budget</div>
              <div className="field-pair">
                <label>
                  Optuna trials per study
                  <input
                    type="number"
                    min="1"
                    max="200"
                    value={trials}
                    disabled={quick}
                    onChange={(e) => setTrials(Math.max(1, Math.min(200, Number(e.target.value))))}
                  />
                </label>
                <label>
                  Random seed
                  <input type="number" min="0" value={seed} onChange={(e) => setSeed(e.target.value)} />
                </label>
                <label>
                  Interval level
                  <select value={level} onChange={(e) => setLevel(Number(e.target.value))}>
                    <option value={0.8}>80%</option>
                    <option value={0.9}>90% (default)</option>
                    <option value={0.95}>95%</option>
                  </select>
                </label>
                <label>
                  Time cap per study (s)
                  <input type="number" min="1" max="3600" placeholder="none" value={timeCap} onChange={(e) => setTimeCap(e.target.value)} />
                </label>
              </div>
              <label className="toggle-line">
                <input type="checkbox" checked={quick} onChange={(e) => setQuick(e.target.checked)} /> Quick run (10 trials per study)
              </label>

              <div className="run-summary" aria-live="polite">
                <span>
                  <b>{activeModels.length}</b> model{activeModels.length === 1 ? "" : "s"}
                </span>
                <span>
                  <b>{imputeInfo?.label || imputation}</b> fill
                </span>
                <span>
                  ≈ <b>{totalTrials.toLocaleString()}</b> trials
                </span>
              </div>
              <button className="btn primary" disabled={busy || !activeModels.length} onClick={train}>
                {busy ? <Loader2 className="spin" size={17} /> : <Play size={17} />} Start Optuna training job
              </button>
              <p className="caption">
                Optuna TPE with MedianPruner; the candidate stays undeployed until you approve it in the Models tab.
              </p>
            </section>

            <div className="stack">
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Missing-value profile</h2>
                    <p>
                      {missing
                        ? `${missing.features_with_missing} of ${missing.features} features have gaps · ${missing.cells_missing_pct}% of all cells`
                        : "Where the dataset has gaps, to help you choose a fill strategy"}
                    </p>
                  </div>
                  <Database />
                </div>
                {missingChart.length ? (
                  <div className="chart-box">
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={missingChart} layout="vertical" margin={{ left: 8, right: 16 }}>
                        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                        <XAxis type="number" unit="%" domain={[0, 100]} />
                        <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(v) => [`${v}% missing`, ""]} />
                        <Bar dataKey="pct" radius={[0, 6, 6, 0]} animationDuration={900}>
                          {missingChart.map((d) => (
                            <Cell key={d.name} fill={d.pct > 50 ? "var(--c5)" : d.pct > 20 ? "var(--c4)" : "var(--c1)"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <Empty text={missing ? "No missing values in the model features." : "Profile not loaded yet."} />
                )}
                <p className="caption">
                  Columns above ~50% missing (red) are mostly guessed by any strategy; KNN or Iterative can use related columns, while Median is the steadiest on a dataset this small.
                </p>
              </section>

              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Training queue</h2>
                    <p>Latest jobs</p>
                  </div>
                  <button className="btn ghost" onClick={refresh} aria-label="Refresh jobs">
                    <RefreshCw size={15} />
                  </button>
                </div>
                {!jobs?.length && <Empty text="No training jobs yet." />}
                {jobs?.map((j) => (
                  <div className="job-card" key={j.id}>
                    <div>
                      <b>{j.status}</b>
                      <small className="mono">{j.id}</small>
                    </div>
                    <span>{Math.round((j.progress || 0) * 100)}%</span>
                    {["queued", "running"].includes(j.status) && (
                      <button
                        className="btn ghost"
                        onClick={async () => {
                          try {
                            await api.post("/train/cancel", { job_id: j.id });
                            await refresh();
                          } catch (x) {
                            setErr(x.message);
                          }
                        }}
                      >
                        Cancel
                      </button>
                    )}
                    <div className={"progress" + (["queued", "running"].includes(j.status) ? " live" : "")}>
                      <i style={{ width: `${(j.progress || 0) * 100}%` }} />
                    </div>
                    {j.error && <p className="danger-text">{j.error}</p>}
                    {jobResult(j).config && (
                      <p className="caption">
                        {jobResult(j).config.models?.join(", ")} · {jobResult(j).config.imputation} fill
                        {jobResult(j).config.missing_indicator ? " + indicators" : ""}
                      </p>
                    )}
                    {jobResult(j).hpo_summary && (
                      <details>
                        <summary>HPO summary · {jobResult(j).version}</summary>
                        <p className="caption">
                          {jobResult(j).hpo_summary.trials_per_study} trials/study · {jobResult(j).hpo_summary.sampler} ·{" "}
                          {jobResult(j).hpo_summary.pruner}
                        </p>
                        <pre>{JSON.stringify(jobResult(j).hpo_summary.selected_final_params, null, 2)}</pre>
                      </details>
                    )}
                  </div>
                ))}
              </section>
            </div>
          </div>
        </>
      )}
      {tab === "models" && (
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h2>Model registry</h2>
              <p>Candidate artifacts require explicit confirmation for deployment.</p>
            </div>
            <RefreshCw onClick={refresh} />
          </div>
          {models.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Version</th>
                    <th>Status</th>
                    <th>Algorithm</th>
                    <th>Missing-value fill</th>
                    <th>Grouped R²</th>
                    <th>Grouped RMSE</th>
                    <th>Created</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((m) => {
                    let z = {};
                    try {
                      z = JSON.parse(m.metrics_json);
                    } catch {}
                    return (
                      <tr key={m.version}>
                        <td className="mono">{m.version}</td>
                        <td>
                          <span className="status-pill">{m.status}</span>
                        </td>
                        <td>{z.algorithm ?? "—"}</td>
                        <td>{z.imputation ? z.imputation + (z.missing_indicator === false ? "" : " + indicators") : "median + indicators"}</td>
                        <td>{z.r2?.toFixed(3) ?? "—"}</td>
                        <td>{z.rmse_mmol_g?.toFixed(3) ?? "—"} mmol/g</td>
                        <td>{m.created_at}</td>
                        <td>
                          <button className="btn secondary" disabled={m.status === "deployed"} onClick={() => deploy(m.version)}>
                            Deploy
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty text="No candidate model versions have been registered yet. Start a training job." />
          )}
        </div>
      )}
      {tab === "users" && (
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h2>Accounts</h2>
              <p>Developer accounts are protected from user disable actions.</p>
            </div>
            <Users />
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.username}</td>
                    <td>{u.email}</td>
                    <td>{u.role}</td>
                    <td>{u.disabled ? "Disabled" : "Active"}</td>
                    <td>{u.created_at}</td>
                    <td>
                      {u.role === "user" && (
                        <button className="btn secondary" onClick={() => disable(u)}>
                          {u.disabled ? "Enable" : "Disable"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {tab === "audit" && (
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h2>Audit events</h2>
              <p>Recent administrative and authentication actions.</p>
            </div>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Detail</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((x) => (
                  <tr key={x.id}>
                    <td>{x.created_at}</td>
                    <td>{x.actor_id ?? "system"}</td>
                    <td>{x.action}</td>
                    <td>{x.detail}</td>
                    <td>{x.ip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {tab === "security" && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Developer credentials</h2>
              <p>Rotate the developer console password.</p>
            </div>
            <LockKeyhole />
          </div>
          <form onSubmit={updateDevPassword}>
            <label>
              Current password
              <input
                type="password"
                required
                value={devPw.current_password}
                onChange={(e) => setDevPw({ ...devPw, current_password: e.target.value })}
              />
            </label>
            <label>
              New password
              <input
                type="password"
                required
                minLength="12"
                value={devPw.new_password}
                onChange={(e) => setDevPw({ ...devPw, new_password: e.target.value })}
              />
            </label>
            <div className="caption">The new bcrypt hash is stored in SQLite. Keep the environment secret as a recovery value.</div>
            {uploadNotice && <div className="alert success">{uploadNotice}</div>}
            <button className="btn primary">Change developer password</button>
          </form>
        </section>
      )}
      </div>
    </>
  );
}
