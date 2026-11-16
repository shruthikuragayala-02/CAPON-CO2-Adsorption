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
  CapacityRing,
  SectionTitle,
  Loading,
  Empty,
  inputDefaults,
  numFields,
  fieldBounds,
} from "../components/shared";

export function PredictPage() {
  const unit = localStorage.getItem("unit") || "mg/g";
  const [form, setForm] = useState(() => {
    try {
      return { ...inputDefaults, ...JSON.parse(sessionStorage.getItem("prefill") || "{}") };
    } catch {
      return inputDefaults;
    }
  });
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    setResult(null);
    try {
      setResult(await api.post("/predict", form));
    } catch (x) {
      setError(x.message);
    } finally {
      setBusy(false);
    }
  };
  const reset = () => {
    setForm(inputDefaults);
    setResult(null);
    sessionStorage.removeItem("prefill");
  };
  return (
    <>
      <SectionTitle
        eyebrow="SINGLE EXPERIMENT"
        title="Predict capacity"
        desc="Translate material composition and operating conditions into a research-screening estimate."
        right={
          <span className="unit-note">
            <Info size={15} /> Capacity target: mg/g
          </span>
        }
      />
      <form onSubmit={submit}>
        <datalist id="active-options">
          <option value="MgO" />
          <option value="MgO+CaCO3" />
        </datalist>
        <datalist id="promoter-options">
          <option value="NaNO3" />
          <option value="NaNO2" />
          <option value="KNO3" />
          <option value="LiNO3" />
          <option value="Na2CO3" />
          <option value="KOH" />
        </datalist>
        <datalist id="precursor-options">
          <option value="Mg(NO3)2·6H2O" />
          <option value="MgCl2·6H2O" />
          <option value="commercial MgO" />
          <option value="Mg5(CO3)4(OH)2·4H2O" />
        </datalist>
        <datalist id="synthesis-options">
          <option value="Impregnation" />
          <option value="Precipitation" />
          <option value="Wet-Mixing" />
          <option value="Hydrothermal" />
          <option value="Calcination" />
          <option value="Aerogel" />
        </datalist>
        <div className="form-layout">
          <div className="form-main">
            <div className="form-section">
              <div className="form-section-title">
                <span>01</span>
                <div>
                  <h2>Material composition</h2>
                  <p>Enter composition and preparation descriptors.</p>
                </div>
              </div>
              <div className="field-grid">
                {[
                  ["active_component", "Active component", "text"],
                  ["promoter", "Promoter formula(s)", "text"],
                  ["ratio", "Promoter ratio", "text"],
                  ["precursor", "Precursor", "text"],
                  ["synthesis_method", "Synthesis method", "text"],
                ].map(([k, l, t]) => (
                  <label key={k}>
                    {l}
                    <input
                      type={t}
                      list={
                        k === "active_component"
                          ? "active-options"
                          : k === "promoter"
                            ? "promoter-options"
                            : k === "precursor"
                              ? "precursor-options"
                              : k === "synthesis_method"
                                ? "synthesis-options"
                                : undefined
                      }
                      value={form[k] ?? ""}
                      onChange={(e) => update(k, e.target.value)}
                      placeholder={k === "promoter" ? "NaNO3, KNO3…" : l}
                    />
                    <small>{k === "ratio" ? "Use a ratio such as 1:2, or a single value." : ""}</small>
                  </label>
                ))}
                {numFields.slice(0, 1).map(([k, l, u]) => (
                  <label key={k}>
                    {l}
                    <div className="input-unit">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="any"
                        value={form[k] ?? ""}
                        onChange={(e) => update(k, e.target.value === "" ? "" : Number(e.target.value))}
                      />
                      <span>{u}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div className="form-section">
              <div className="form-section-title">
                <span>02</span>
                <div>
                  <h2>Preparation conditions</h2>
                  <p>Optional values are imputed using the training pipeline.</p>
                </div>
              </div>
              <div className="field-grid">
                {[["pretreatment_gas", "Pretreatment gas", "text"], ...numFields.slice(1, 4)].map(([k, l, u]) => (
                  <label key={k}>
                    {l}
                    {u ? (
                      <div className="input-unit">
                        <input
                          type="number"
                          min={fieldBounds[k]?.[0] ?? 0}
                          max={fieldBounds[k]?.[1]}
                          value={form[k] ?? ""}
                          onChange={(e) => update(k, e.target.value === "" ? "" : Number(e.target.value))}
                        />
                        <span>{u}</span>
                      </div>
                    ) : (
                      <input value={form[k] ?? ""} onChange={(e) => update(k, e.target.value)} placeholder="N₂, He…" />
                    )}
                  </label>
                ))}
              </div>
            </div>
            <div className="form-section">
              <div className="form-section-title">
                <span>03</span>
                <div>
                  <h2>Adsorption conditions</h2>
                  <p>Enter gas composition and experimental operating conditions.</p>
                </div>
              </div>
              <div className="field-grid">
                {[["adsorption_gas", "Adsorption gas", "text"], ...numFields.slice(4, 8)].map(([k, l, u]) => (
                  <label key={k}>
                    {l}
                    {u ? (
                      <div className="input-unit">
                        <input
                          type="number"
                          min={fieldBounds[k]?.[0] ?? 0}
                          max={fieldBounds[k]?.[1]}
                          value={form[k] ?? ""}
                          onChange={(e) => update(k, e.target.value === "" ? "" : Number(e.target.value))}
                        />
                        <span>{u}</span>
                      </div>
                    ) : (
                      <input value={form[k] ?? ""} onChange={(e) => update(k, e.target.value)} placeholder="CO₂, CO₂/N₂…" />
                    )}
                  </label>
                ))}
              </div>
            </div>
            <div className="form-section">
              <div className="form-section-title">
                <span>04</span>
                <div>
                  <h2>Textural properties</h2>
                  <p>Surface and pore measurements. Leave unavailable values blank.</p>
                </div>
              </div>
              <div className="field-grid">
                {numFields.slice(8).map(([k, l, u]) => (
                  <label key={k}>
                    {l}
                    <div className="input-unit">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={form[k] ?? ""}
                        onChange={(e) => update(k, e.target.value === "" ? "" : Number(e.target.value))}
                      />
                      <span>{u}</span>
                    </div>
                  </label>
                ))}
                <label>
                  Application
                  <input
                    value={form.application ?? ""}
                    onChange={(e) => update("application", e.target.value)}
                    placeholder="Fixed bed, TGA…"
                  />
                </label>
              </div>
            </div>
            <div className="form-actions">
              <button className="btn secondary" type="button" onClick={() => setForm(inputDefaults)}>
                Load example
              </button>
              <button className="btn ghost" type="button" onClick={reset}>
                Reset
              </button>
              <button className="btn primary" type="submit" disabled={busy}>
                {busy ? <Loader2 className="spin" size={17} /> : <Activity size={17} />} Predict capacity
              </button>
            </div>
            {error && <div className="alert danger">{error}</div>}
          </div>
          <aside className="result-column">
            {result ? (
              <div className="result-card">
                <div className="result-head">
                  <span className="result-icon">
                    <CheckCircle2 />
                  </span>
                  <span className="status-pill ok">PREDICTION READY</span>
                </div>
                <div className="result-main">
                  <div className="result-main-text">
                <div className="eyebrow">ESTIMATED CAPACITY</div>
                <div className="result-big">
                  {unit === "mg/g" ? result.capacity_mg_g.toFixed(1) : result.capacity_mmol_g.toFixed(2)}
                  <small>{unit}</small>
                </div>
                <div className="result-convert">
                  {unit === "mg/g" ? result.capacity_mmol_g.toFixed(2) + " mmol/g" : result.capacity_mg_g.toFixed(1) + " mg/g"}{" "}
                  <span>alternate unit</span>
                </div>
                  </div>
                  <CapacityRing value={result.capacity_mg_g} />
                </div>
                {result.uncertainty ? (
                  <>
                    <div className="result-range">
                      <div>
                        <span>{Math.round(result.uncertainty.confidence_level * 100)}% prediction interval</span>
                        <b>
                          {unit === "mg/g"
                            ? `${result.uncertainty.lower_mg_g.toFixed(0)} – ${result.uncertainty.upper_mg_g.toFixed(0)} mg/g`
                            : `${result.uncertainty.lower_mmol_g.toFixed(2)} – ${result.uncertainty.upper_mmol_g.toFixed(2)} mmol/g`}
                        </b>
                      </div>
                      <small>
                        ±{unit === "mg/g" ? result.uncertainty_estimate_mg_g.toFixed(0) : result.uncertainty_estimate_mmol_g.toFixed(2)}{" "}
                        {unit}
                      </small>
                    </div>
                    <p className="result-note">{result.uncertainty.method}</p>
                    <span
                      className={`status-pill ${result.confidence_flag === "high" ? "ok" : result.confidence_flag === "medium" ? "warn" : "danger"}`}
                      aria-label={`Confidence ${result.confidence_flag}`}
                    >
                      {result.confidence_flag.toUpperCase()} CONFIDENCE
                    </span>
                  </>
                ) : (
                  <div className="mini-note">
                    <Info size={15} />
                    {result.uncertainty_message || "Prediction interval unavailable for this model."}
                  </div>
                )}
                {result.ood_warning && (
                  <div className="alert warning">
                    <AlertTriangle size={17} />
                    <span>Some derived inputs are outside observed training ranges. Treat as extrapolation.</span>
                  </div>
                )}
                {result.local_explanation ? (
                  <div className="result-detail">
                    <b>Local Tree SHAP · additive</b>
                    <small>Signed contribution to prediction ({unit}); full explanation sums to estimate.</small>
                    {result.local_explanation.contributions.slice(0, 8).map((c) => (
                      <div className="kv-row" key={c.feature}>
                        <span>{c.feature}</span>
                        <b>
                          {(c.shap_mg_g / (unit === "mg/g" ? 1 : 44.01) > 0 ? "+" : "") +
                            (c.shap_mg_g / (unit === "mg/g" ? 1 : 44.01)).toFixed(unit === "mg/g" ? 1 : 3)}{" "}
                          {unit}
                        </b>
                      </div>
                    ))}
                    <small>
                      Base{" "}
                      {unit === "mg/g"
                        ? result.local_explanation.base_value_mg_g.toFixed(1)
                        : (result.local_explanation.base_value_mg_g / 44.01).toFixed(3)}{" "}
                      + all contributions ={" "}
                      {unit === "mg/g"
                        ? result.local_explanation.sum_check.toFixed(1)
                        : (result.local_explanation.sum_check / 44.01).toFixed(3)}{" "}
                      {unit}
                    </small>
                  </div>
                ) : (
                  <div className="result-detail">
                    <b>Local explanation unavailable</b>
                    <small>{result.explanation_error || "This saved model does not include a SHAP background artifact."}</small>
                  </div>
                )}
                <div className="model-stamp">
                  Model {result.model_version} · ID {result.prediction_id.slice(0, 8)}
                </div>
              </div>
            ) : (
              <div className="result-empty">
                <span className="big-orbit">
                  <FlaskConical size={30} />
                </span>
                <h3>Your result appears here</h3>
                <p>
                  Complete the experimental inputs, then run the deployed model. Values in the web form are subject to observed-range
                  warnings.
                </p>
                <div className="mini-note">
                  <Info size={15} /> Screening estimate only — validate experimentally.
                </div>
              </div>
            )}
          </aside>
        </div>
      </form>
    </>
  );
}
