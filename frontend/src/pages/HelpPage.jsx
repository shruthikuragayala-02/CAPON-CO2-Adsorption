import React from "react";
import { SectionTitle, AlertTriangle, Info } from "../components/shared";
export function HelpPage() {
  return (
    <>
      <SectionTitle eyebrow="DOCUMENTATION" title="About & help" desc="Scientific context, uncertainty interpretation and practical use." />
      <div className="grid-two">
        <section className="panel">
          <span className="eyebrow">PURPOSE</span>
          <h2>CO₂ adsorption screening for MgO sorbents</h2>
          <p>
            This research tool estimates reported adsorption capacity from material descriptors and process conditions. It is designed for
            exploratory screening, not process guarantees.
          </p>
          <h3>Using the predictor</h3>
          <ol className="help-list">
            <li>Enter composition and preparation descriptors where reported.</li>
            <li>Use the displayed units for pretreatment and adsorption settings.</li>
            <li>Leave unavailable optional measurements blank; the trained pipeline imputes them.</li>
            <li>Review the calibrated prediction interval, confidence badge, OOD warnings and local Tree SHAP explanation.</li>
            <li>Validate promising settings experimentally before acting on them.</li>
          </ol>
        </section>
        <section className="panel">
          <span className="eyebrow">UNITS & VALIDATION</span>
          <h2>What the numbers mean</h2>
          <p>
            Capacity is kept in mg/g throughout training and inference. Conversion: mmol/g = mg/g ÷ 44.01. R² is unitless; RMSE in mmol/g
            equals source-unit RMSE ÷ 44.01.
          </p>
          <p>
            <b>Random 5-fold</b> may mix observations from the same paper across folds. <b>Nested study-grouped validation</b> keeps entire
            studies out of each outer test fold and is the more relevant estimate for unseen studies.
          </p>
          <div className="mini-note">
            <Info size={15} /> Empirical grouped coverage is reported from held-out outer-fold predictions; it may differ from the target.
            Intervals are not guaranteed for every future study.
          </div>
        </section>
        <section className="panel">
          <span className="eyebrow">INTERVALS & CONFIDENCE</span>
          <h2>Calibrated, locally adaptive uncertainty</h2>
          <p>
            The interval uses a study-grouped normalized conformal calibration score and a feature-dependent scale model trained on
            out-of-fold absolute residuals. Width varies by candidate. OOD feature-range violations widen the interval and lower the
            confidence status.
          </p>
          <p>
            The badge is a width-based screening indicator, not a probability that the individual prediction is correct. Older model
            artifacts without calibration show no interval, rather than an RMSE-based substitute.
          </p>
        </section>
        <section className="panel">
          <span className="eyebrow">EXPLANATIONS & OPTIMIZATION</span>
          <h2>Interpret model-guided results cautiously</h2>
          <p>
            Local explanations use TreeExplainer SHAP on the pipeline-imputed feature vector. The additive contributions describe the fitted
            model, not causal effects.
          </p>
          <p>
            Optuna TPE ranks conditions by either predicted mean or a conservative objective (prediction − k × estimated uncertainty).
            Temperature and time bounds are hard constraints. OOD candidates are penalized and flagged. The search is not an experiment and
            does not guarantee a global optimum.
          </p>
        </section>
        <section className="panel">
          <span className="eyebrow">LIMITATIONS</span>
          <h2>Use with scientific judgment</h2>
          <ul className="help-list">
            <li>The available data covers a limited number of observations and research studies.</li>
            <li>Apparatus, protocols, compositions and reporting conventions differ across papers.</li>
            <li>Missingness and measurement uncertainty exist in the source data.</li>
            <li>Out-of-range predictions are extrapolations; feature range checks do not detect every distribution shift.</li>
            <li>Associations are not causal effects. Optimized settings need experimental confirmation.</li>
          </ul>
          <div className="alert warning">
            <AlertTriangle size={17} /> Screening analysis only. No accuracy or experimental outcome is guaranteed.
          </div>
        </section>
        <section className="panel">
          <span className="eyebrow">FAQ</span>
          <h2>Frequently asked</h2>
          <details>
            <summary>Why might interval coverage miss its target?</summary>
            <p>
              Only a small number of studies are available. Coverage is evaluated on pooled held-out studies and is reported as observed,
              not forced to match the nominal target.
            </p>
          </details>
          <details>
            <summary>What if an interval is unavailable?</summary>
            <p>
              The active artifact may predate calibration. The platform shows a neutral unavailable state and never substitutes a
              global-RMSE interval.
            </p>
          </details>
          <details>
            <summary>Does a strong SHAP contribution mean causality?</summary>
            <p>No. SHAP decomposes this model's prediction relative to its background data; it does not estimate an intervention effect.</p>
          </details>
        </section>
      </div>
    </>
  );
}
