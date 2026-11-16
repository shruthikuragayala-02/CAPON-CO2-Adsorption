import React, { useState } from "react";
import {
  api,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Activity,
  ArrowRight,
  Info,
  Loader2,
  Play,
  Workflow,
  AlertTriangle,
  SectionTitle,
  Empty,
  inputDefaults,
  fieldBounds,
} from "../components/shared";
const labels = {
  adsorption_temperature: "Adsorption temperature · °C",
  adsorption_time: "Adsorption time · min",
  co2_percentage: "CO₂ concentration · %",
  surface_area: "Surface area · m²/g",
  pretreatment_temperature: "Pretreatment temperature · °C",
  pretreatment_time: "Pretreatment time · min",
  active_pct: "Active component · %",
  adsorption_flow: "Adsorption flow",
  pretreatment_flow: "Pretreatment flow",
  pore_volume: "Pore volume · cm³/g",
  pore_size: "Pore size · nm",
};
const defaults = { adsorption_temperature: [220, 380], adsorption_time: [30, 240], co2_percentage: [30, 100], surface_area: [0, 672] };
export function OptimizePage() {
  const [free, setFree] = useState(defaults),
    [fixed, setFixed] = useState({
      active_pct: 85,
      active_component: "MgO",
      promoter: "NaNO3",
      ratio: "1",
      synthesis_method: "Impregnation",
      pretreatment_gas: "N2",
      pretreatment_temperature: 400,
      pretreatment_time: 30,
      adsorption_gas: "CO2",
      adsorption_flow: 80,
      application: "Fixed bed",
    });
  const [mode, setMode] = useState("lower_bound"),
    [k, setK] = useState(1),
    [trials, setTrials] = useState(50),
    [res, setRes] = useState(null),
    [busy, setBusy] = useState(false),
    [err, setErr] = useState("");
  const changeRange = (name, i, value) => setFree((prev) => ({ ...prev, [name]: prev[name].map((x, j) => (j === i ? Number(value) : x)) }));
  const run = async () => {
    setBusy(true);
    setErr("");
    setRes(null);
    try {
      setRes(
        await api.post("/optimize/conditions", {
          fixed,
          free,
          objective_mode: mode,
          k: Number(k),
          ood_penalty: 1,
          n_trials: Number(trials),
          max_temperature: 400,
          max_time: 240,
        }),
      );
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const transfer = (cond) => {
    sessionStorage.setItem("prefill", JSON.stringify({ ...inputDefaults, ...cond }));
    location.href = "/predict";
  };
  return (
    <>
      <SectionTitle
        eyebrow="EXPLORATORY SEARCH"
        title="Optimize conditions"
        desc="Optuna TPE search ranks distinct model-guided candidates. Temperature and time limits are enforced as hard bounds; suggestions are not experimental guarantees."
        right={
          <span className="status-pill warn">
            <AlertTriangle size={14} /> Model-guided screening
          </span>
        }
      />
      <div className="grid-two optimize-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Search space</h2>
              <p>Select free numeric parameters and ranges</p>
            </div>
            <Workflow />
          </div>
          <div className="range-list">
            {Object.keys(labels)
              .slice(0, 8)
              .map((name) => {
                const selected = !!free[name],
                  lim = fieldBounds[name] || [0, 1000];
                return (
                  <div className="range-item" key={name}>
                    <label className="toggle-line">
                      <input
                        aria-label={`Optimize ${labels[name]}`}
                        type="checkbox"
                        checked={selected}
                        onChange={(e) => {
                          if (e.target.checked) setFree((p) => ({ ...p, [name]: defaults[name] || lim }));
                          else
                            setFree((p) => {
                              const n = { ...p };
                              delete n[name];
                              return n;
                            });
                        }}
                      />
                      <b>{labels[name]}</b>
                    </label>
                    {selected && (
                      <div className="range-inputs">
                        <input
                          aria-label={`${labels[name]} minimum`}
                          type="number"
                          value={free[name][0]}
                          onChange={(e) => changeRange(name, 0, e.target.value)}
                        />
                        <span>to</span>
                        <input
                          aria-label={`${labels[name]} maximum`}
                          type="number"
                          value={free[name][1]}
                          onChange={(e) => changeRange(name, 1, e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
          <div className="fixed-fields">
            <h3>Fixed assumptions</h3>
            <div className="field-grid compact">
              <label>
                Active material %
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={fixed.active_pct}
                  onChange={(e) => setFixed({ ...fixed, active_pct: Number(e.target.value) })}
                />
              </label>
              <label>
                Promoter
                <input value={fixed.promoter} onChange={(e) => setFixed({ ...fixed, promoter: e.target.value })} />
              </label>
              <label>
                Promoter ratio
                <input value={fixed.ratio} onChange={(e) => setFixed({ ...fixed, ratio: e.target.value })} />
              </label>
              <label>
                Synthesis method
                <input value={fixed.synthesis_method} onChange={(e) => setFixed({ ...fixed, synthesis_method: e.target.value })} />
              </label>
            </div>
          </div>
          <div className="field-grid compact">
            <label>
              Objective
              <select aria-label="Optimization objective" value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="lower_bound">Conservative: prediction − k × uncertainty</option>
                <option value="mean">Predicted mean capacity</option>
              </select>
            </label>
            <label>
              Risk factor k
              <input
                aria-label="Risk factor k"
                type="number"
                min="0"
                max="10"
                step="0.1"
                value={k}
                disabled={mode === "mean"}
                onChange={(e) => setK(e.target.value)}
              />
            </label>
            <label>
              Optuna trials
              <input
                aria-label="Optuna trials"
                type="number"
                min="1"
                max="2000"
                value={trials}
                onChange={(e) => setTrials(e.target.value)}
              />
            </label>
          </div>
          <div className="mini-note">
            <Info size={15} /> Hard bounds: adsorption temperature ≤ 400 °C; adsorption time ≤ 240 min. Each candidate is OOD-flagged and
            uncertainty-penalized.
          </div>
          {err && (
            <div role="alert" className="alert danger">
              {err}
            </div>
          )}
          <button className="btn primary wide" disabled={busy || !Object.keys(free).length} onClick={run}>
            {busy ? <Loader2 className="spin" size={17} /> : <Play size={17} />} Run Optuna search ({trials} trials)
          </button>
        </section>
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h2>Optimization progress</h2>
              <p>Cumulative best objective · mg/g</p>
            </div>
          </div>
          {res ? (
            <ResponsiveContainer width="100%" height={265}>
              <LineChart data={res.convergence}>
                <CartesianGrid strokeDasharray="4 4" stroke="var(--line)" />
                <XAxis dataKey="trial" height={44} label={{ value: "Trial", position: "insideBottom", offset: 0 }} />
                <YAxis width={58} label={{ value: "mg/g", angle: -90, position: "insideLeft", offset: 10 }} />
                <Tooltip cursor={{ stroke: "var(--c4)", strokeOpacity: 0.4, strokeDasharray: "4 4" }} />
                <Line dataKey="best_objective_mg_g" name="Best risk-adjusted objective" stroke="var(--c4)" dot={false} strokeWidth={3} type="monotone" animationDuration={1400} animationEasing="ease-out" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <Empty text="Run the search to view its convergence trace." />
          )}
          <div className="mini-note">
            <Info size={15} /> {res?.method || "Optuna TPE Bayesian optimisation"}. Search performance is model-dependent, not a global
            guarantee.
          </div>
        </div>
      </div>
      {res && (
        <section className="panel results-table">
          <div className="panel-heading">
            <div>
              <h2>Top distinct candidates</h2>
              <p>Ranked by {mode === "mean" ? "predicted mean" : "risk-adjusted conservative objective"} · mg/g</p>
            </div>
          </div>
          <div className="candidate-grid">
            {res.top_candidates.map((x, i) => (
              <div className="candidate-card" key={i}>
                <div className="candidate-rank">0{i + 1}</div>
                <b>
                  {x.prediction.capacity_mg_g.toFixed(1)} <small>mg/g</small>
                </b>
                <span>{x.prediction.capacity_mmol_g.toFixed(2)} mmol/g</span>
                <div className="candidate-conditions">
                  {Object.keys(free).map((name) => (
                    <small key={name}>
                      {labels[name]}: {Number(x.conditions[name]).toFixed(1)}
                    </small>
                  ))}
                </div>
                <div className="kv-row">
                  <span>Objective score</span>
                  <b>{x.objective_value_mg_g.toFixed(1)} mg/g</b>
                </div>
                {x.uncertainty ? (
                  <div className="kv-row">
                    <span>{Math.round(x.uncertainty.confidence_level * 100)}% interval</span>
                    <b>
                      {x.uncertainty.lower_mg_g.toFixed(0)}–{x.uncertainty.upper_mg_g.toFixed(0)} mg/g
                    </b>
                  </div>
                ) : (
                  <small>Prediction interval unavailable</small>
                )}
                <span className={`status-pill ${x.confidence_flag === "high" ? "ok" : x.confidence_flag === "medium" ? "warn" : "danger"}`}>
                  {x.confidence_flag} confidence
                </span>
                {x.ood_warning && <div className="alert warning small-alert">Outside training feature ranges: extrapolation flagged</div>}
                <button className="btn secondary wide" onClick={() => transfer(x.conditions)}>
                  Use these inputs <ArrowRight size={15} />
                </button>
              </div>
            ))}
          </div>
          <p className="muted tiny">{res.warnings.join(" ")}</p>
        </section>
      )}
    </>
  );
}
