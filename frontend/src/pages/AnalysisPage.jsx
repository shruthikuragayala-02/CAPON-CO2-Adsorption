import React, { useEffect, useState } from "react";
import {
  api,
  apiBase,
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Metric,
  SectionTitle,
  Loading,
  Empty,
  Info,
  ArrowDownToLine,
} from "../components/shared";
export function AnalysisPage() {
  const [ev, setEv] = useState(null),
    [imp, setImp] = useState([]),
    [shap, setShap] = useState([]),
    [hpo, setHpo] = useState(null),
    [ds, setDs] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    Promise.all([
      api.get("/evaluation"),
      api.get("/feature-importance"),
      api.get("/dataset"),
      api.get("/shap/importance").catch(() => []),
      api.get("/hpo").catch(() => ({})),
    ])
      .then(([e, i, d, s, h]) => {
        setEv(e);
        setImp(i);
        setDs(d);
        setShap(s);
        setHpo(h);
      })
      .catch((x) => setError(x.message));
  }, []);
  if (error)
    return (
      <>
        <SectionTitle eyebrow="MODEL VALIDATION" title="Analysis" />
        <div className="alert warning">{error}</div>
      </>
    );
  if (!ev) return <Loading />;
  const v = ev.validation || {},
    group = v.study_grouped_nested_5_fold || {},
    random = v.random_5_fold || {},
    name = ev.model?.name,
    g = group[name]?.metrics,
    r = random[name]?.metrics,
    cal = ev.calibration || {},
    comparison = Object.keys(group).map((k) => ({
      model: k.replace("GradientBoosting", "GradBoost"),
      grouped: group[k].metrics.rmse_mmol_g,
      random: random[k]?.metrics.rmse_mmol_g,
    })),
    hpoModels = hpo?.summary?.models || {},
    paramRows = Object.entries(hpo?.parameter_importance || {})
      .flatMap(([model, values]) => Object.entries(values || {}).map(([parameter, importance]) => ({ model, parameter, importance })))
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 12);
  return (
    <>
      <SectionTitle
        eyebrow="EVALUATION & INTERPRETABILITY"
        title="Model analysis"
        desc="Nested study-grouped results, calibration diagnostics, SHAP and HPO history from the saved training run."
        right={
          <a className="btn secondary" href={`${apiBase}/reports/optimization_history.png`} download>
            Download HPO plot <ArrowDownToLine size={16} />
          </a>
        }
      />
      <div className="validation-banner">
        <div className="banner-icon">
          <Info />
        </div>
        <div>
          <b>Study-grouped validation is the primary generalization estimate for unseen papers.</b>
          <p>
            Entire Study IDs are held out. These empirical results may miss the nominal interval coverage; see the reported coverage and
            width below.
          </p>
        </div>
      </div>
      <div className="grid-two validation-panels">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">CONVENTIONAL COMPARISON</span>
              <h2>Random 5-fold CV</h2>
            </div>
            <span className="status-pill warn">Not unseen-study</span>
          </div>
          {r ? (
            <div className="metric-grid compact-metrics">
              <Metric label="R²" value={r.r2.toFixed(3)} accent="blue" />
              <Metric label="MAE" value={r.mae_mg_g.toFixed(1)} unit="mg/g" />
              <Metric label="RMSE" value={r.rmse_mmol_g.toFixed(3)} unit="mmol/g" />
              <Metric label="MSE" value={r.mse_mg_g_squared.toFixed(1)} unit="(mg/g)²" />
            </div>
          ) : (
            <Empty text="Random 5-fold result unavailable" />
          )}
        </div>
        <div className="panel grouped-focus">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">PRIMARY GENERALIZATION ESTIMATE</span>
              <h2>Study-grouped nested 5-fold</h2>
            </div>
            <span className="status-pill ok">Study-level split</span>
          </div>
          {g ? (
            <div className="metric-grid compact-metrics">
              <Metric label="R²" value={g.r2.toFixed(3)} accent="blue" />
              <Metric label="MAE" value={g.mae_mg_g.toFixed(1)} unit="mg/g" />
              <Metric label="RMSE" value={g.rmse_mmol_g.toFixed(3)} unit="mmol/g" />
              <Metric label="RMSE source" value={g.rmse_mg_g.toFixed(1)} unit="mg/g" />
            </div>
          ) : (
            <Empty text="No grouped result" />
          )}
        </div>
      </div>
      <div className="grid-two">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Prediction interval validation</h2>
              <p>Actual pooled outer-fold held-out coverage</p>
            </div>
          </div>
          <div className="metric-grid compact-metrics">
            <Metric
              label="Target coverage"
              value={cal.target_coverage == null ? "—" : `${(cal.target_coverage * 100).toFixed(0)}%`}
              accent="blue"
            />
            <Metric
              label="Empirical coverage"
              value={cal.empirical_coverage == null ? "—" : `${(cal.empirical_coverage * 100).toFixed(1)}%`}
            />
            <Metric label="Mean interval width" value={cal.mean_interval_width_mg_g?.toFixed(1) ?? "—"} unit="mg/g" />
            <Metric label="Conformal q" value={cal.conformal_quantile?.toFixed(3) ?? "—"} />
          </div>
          <p className="caption">
            {cal.coverage_note || "Coverage is measured only on grouped outer test folds, not from training residuals."}
          </p>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Model comparison</h2>
              <p>RMSE by validation scheme · mmol/g</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={comparison}>
              <CartesianGrid strokeDasharray="4 4" stroke="var(--line)" />
              <XAxis dataKey="model" height={40} />
              <YAxis width={58} label={{ value: "RMSE · mmol/g", angle: -90, position: "insideLeft", offset: 6 }} />
              <Tooltip cursor={{ fill: "var(--tint)" }} />
              <Legend iconType="circle" />
              <Bar dataKey="random" name="Random 5-fold" fill="var(--c3)" radius={[6, 6, 0, 0]} animationDuration={1200} animationEasing="ease-out" />
              <Bar dataKey="grouped" name="Study-grouped nested" fill="var(--c1)" radius={[6, 6, 0, 0]} animationDuration={1200} animationEasing="ease-out" />
            </BarChart>
          </ResponsiveContainer>
          <div className="caption">RMSE (mmol/g) = RMSE (mg/g) ÷ 44.01. R² is unitless.</div>
        </section>
      </div>
      <div className="grid-two">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Global Tree SHAP</h2>
              <p>Mean absolute SHAP value · mg/g, fitted-model descriptive summary</p>
            </div>
          </div>
          {shap.length ? (
            <ResponsiveContainer width="100%" height={Math.max(280, Math.min(420, shap.slice(0, 12).length * 30))}>
              <BarChart data={shap.slice(0, 12).reverse()} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                <XAxis type="number" height={44} label={{ value: "Mean |SHAP| · mg/g", position: "insideBottom", offset: 0 }} />
                <YAxis type="category" dataKey="feature" width={130} tick={{ fontSize: 11 }} />
                <Tooltip cursor={{ fill: "var(--tint)" }} />
                <Bar dataKey="mean_abs_shap_mg_g" name="Mean |SHAP| (mg/g)" fill="var(--c2)" radius={[0, 6, 6, 0]} animationDuration={1200} animationEasing="ease-out" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Empty text="Global SHAP report is not available." />
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>SHAP summary plot</h2>
              <p>TreeExplainer contributions; global plot</p>
            </div>
          </div>
          <img className="report-image" src={`${apiBase}/reports/shap_summary_beeswarm.png`} alt="Tree SHAP global summary plot" />
          <a className="btn secondary wide" href={`${apiBase}/reports/shap_summary_beeswarm.png`} download>
            Download SHAP plot <ArrowDownToLine size={15} />
          </a>
        </section>
      </div>
      <div className="grid-two">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>HPO and search history</h2>
              <p>Optuna TPE · MedianPruner · grouped RMSE objective</p>
            </div>
          </div>
          <img className="report-image" src={`${apiBase}/reports/optimization_history.png`} alt="Optuna optimization history" />
          <p className="caption">
            {hpo?.summary?.trials_per_study ?? "—"} trials per study · seed {hpo?.summary?.seed ?? "—"} ·{" "}
            {hpo?.summary?.objective || "Grouped-fold RMSE objective"}
          </p>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Hyperparameter importance</h2>
              <p>Optuna importance, where estimable</p>
            </div>
          </div>
          {paramRows.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Study / model</th>
                    <th>Parameter</th>
                    <th>Importance</th>
                  </tr>
                </thead>
                <tbody>
                  {paramRows.map((x, i) => (
                    <tr key={i}>
                      <td>{x.model}</td>
                      <td>{x.parameter}</td>
                      <td>{x.importance.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty text="Importance unavailable (often expected with very few completed trials)." />
          )}
        </section>
      </div>
      <div className="grid-two">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Permutation importance</h2>
              <p>Training-set descriptive importance · not a held-out test metric</p>
            </div>
          </div>
          {imp.length ? (
            <ResponsiveContainer width="100%" height={Math.max(260, Math.min(400, imp.slice(0, 10).length * 32))}>
              <BarChart data={imp.slice(0, 10).reverse()} layout="vertical" margin={{ left: 25 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                <XAxis type="number" height={44} label={{ value: "Drop in R²", position: "insideBottom", offset: 0 }} />
                <YAxis type="category" dataKey="feature" width={125} tick={{ fontSize: 11 }} />
                <Tooltip cursor={{ fill: "var(--tint)" }} />
                <Bar dataKey="importance_mean_drop_r2" name="Drop in R²" fill="var(--c6)" radius={[0, 6, 6, 0]} animationDuration={1200} animationEasing="ease-out" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Empty text="No permutation importance" />
          )}
        </section>
        <section className="panel">
          <h2>Dataset and training record</h2>
          <div className="kv-row">
            <span>Observations / studies</span>
            <b>
              {ds?.valid_target_and_study_rows ?? "—"} / {ds?.study_count ?? "—"}
            </b>
          </div>
          <div className="kv-row">
            <span>Selected algorithm</span>
            <b>{ev.model?.name}</b>
          </div>
          <div className="kv-row">
            <span>Model version</span>
            <b>{ev.model?.version}</b>
          </div>
          <div className="kv-row">
            <span>Runtime</span>
            <b>{ev.runtime_seconds}s</b>
          </div>
          <div className="alert warning small-alert">Capacity is mg/g internally. Conversion to mmol/g is mg/g ÷ 44.01.</div>
        </section>
      </div>
    </>
  );
}
