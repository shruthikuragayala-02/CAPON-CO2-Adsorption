# Model card — MgO–CO₂ adsorption capacity screening

## Model identity and version

- **Task:** supervised regression of reported CO₂ adsorption capacity.
- **Active version:** `mgo-20261107-161120` (trained 2026-11-07 UTC; see artifact metadata).
- **Algorithm:** `RandomForestRegressor` inside a median-imputation pipeline with missingness indicators.
- **Target:** normalized source column 21, in mg/g. Capacity is never converted during training or inference.
- **Features:** 47 numeric engineered descriptors from `backend/ml/features.py`; the ordered list is in the joblib artifact.
- **Seed:** 42. Current deployed retrain used quick HPO (10 trials per study) with Optuna TPESampler and MedianPruner.
- **Data hash:** stored in `backend/reports/evaluation.json` and artifact metadata.
- **Artifact contract:** joblib dictionary retains the keys `model`, `features`, `version`, `metadata`.

## Dataset and scope

The supplied CSV contains 345 valid numeric-capacity observations from 22 distinct Study IDs and 41 intended source columns. The normalized copy and repair/audit data are in `data/`. Study ID is used only to group evaluation folds; target column 21 and ID column 40 are excluded from predictors. The existing 41-column loader contract is unchanged. No target rows are removed as outliers. Missing measurements remain missing until the fold-fitted imputer.

The source includes between-study differences in apparatus, preparation and reporting; approximately marked or rounded values; and substantial missingness for textural measurements. These data limitations restrict transportability.

## Training, model selection and leakage control

Optuna minimizes mean RMSE in mg/g across inner Study-GroupKFold folds. Search spaces include continuous and log-scaled dimensions where appropriate; the sampler is TPE and pruning uses MedianPruner. Optional XGBoost, LightGBM and CatBoost models are considered only if installed. The default CLI budget is 50 trials per study; `--quick` uses 10.

For each candidate, an outer 5-fold GroupKFold holds entire studies out. Hyperparameters are tuned only inside each outer training partition with grouped 3-fold CV. Fold-specific uncertainty scale and conformal calibration use only that outer fold’s training groups. The reported interval coverage is measured on the outer held-out groups. Winner selection uses nested grouped RMSE among TreeExplainer-supported candidates. Random 5-fold is reported separately as a conventional comparator, not used as the winner-selection metric. Model comparison/selection can still introduce optimism.

The full-data deployed model is refit after evaluation. Its residual-scale model is learned from out-of-fold absolute errors, and its quantile is derived from normalized outer-held-out study scores. Cross-validation calibration is an empirical estimate; it is not a guarantee under study-distribution shift.

## Current observed performance

Source of truth: `backend/reports/evaluation.json`; all scores below are from the active quick-profile run. Unit conversion is `mmol/g = mg/g ÷ 44.01`.

| Model / validation | R² | MAE (mg/g) | RMSE (mg/g) | RMSE (mmol/g) |
|---|---:|---:|---:|---:|
| RandomForest, random 5-fold baseline settings | 0.554329 | 102.7510 | 154.2121 | 3.504023 |
| RandomForest, nested Study-GroupKFold 5-fold | 0.210249 | 157.7223 | 205.2847 | 4.664501 |
| ExtraTrees, nested Study-GroupKFold 5-fold | 0.069643 | 173.1328 | 222.8108 | 5.062730 |
| GradientBoosting, nested Study-GroupKFold 5-fold | 0.016084 | 173.9157 | 229.1345 | 5.206418 |

Nominal interval level: 90%. Pooled outer held-out coverage: **92.75%**; mean interval width: **785.93 mg/g** (17.86 mmol/g); normalized conformal quantile: 2.2513. The observed coverage exceeds the nominal target in this run; it is not post-adjusted. With only 22 studies the estimate is noisy and may change with seed, data or future studies. Interval widths can be very large; this reflects the high grouped error and variable residual scale.

> Confirm exact metrics and fold details directly in the report JSON before using them. Results from the previous model build are historical and not interchangeable with these metrics.

## Prediction uncertainty, confidence and OOD behavior

A RandomForest model predicts point capacity in mg/g. A feature-dependent scale model predicts an out-of-fold absolute residual scale `sigma(x)`. A normalized conformal quantile `q` gives a symmetric interval `[prediction − q × sigma(x), prediction + q × sigma(x)]`. For features beyond recorded numeric training ranges, the interval is widened and the confidence flag is downgraded. `confidence_flag` is based on relative interval width and is a screening category, not a probability statement.

The service returns interval bounds and confidence level only when calibration is present. Older artifacts without calibration return `uncertainty: null`, null interval fields and a clear message. The service does not use a global RMSE fallback. The separately returned across-tree prediction spread is labeled `model_std_mg_g`; the adaptive residual scale is `sigma_mg_g`.

## Explanations

Local explanations use real `shap.TreeExplainer` values on the pipeline-imputed transformed inputs and the stored background matrix. The API returns the complete feature decomposition, base value, additivity check and any small numerical residual correction; the contributions sum to the pipeline prediction in mg/g. The frontend displays the largest contributions in the chosen unit. Batch and optimizer predictions set `explain=False` for throughput. Global SHAP importance, beeswarm/bar and dependence figures are training-model summaries, not causal estimates or held-out feature effects. Permutation importance is also shown, explicitly as training-set descriptive importance.

## Optimization

Optuna TPE maximizes either predicted mean or the risk-adjusted score `capacity − k × sigma(x)`, with an additional interval-width penalty for OOD candidates. Search bounds are intersected with accepted numeric input domains. User-provided adsorption temperature/time maxima are hard bounds; infeasible ranges are rejected. The service returns up to five distinct candidates, actual interval/confidence/OOD fields and a convergence series. Suggestions are model-guided candidates, not experimental findings or a guaranteed global optimum.

## Intended and non-intended use

**Intended:** exploratory screening and prioritization of experiments within or near the available data domain.

**Not intended:** process control, safety-critical decisions, commercial performance guarantees, replacement of experiments, causal inference, or confident extrapolation far outside the training data.

## Known limitations

- Small dataset, with 22 independent studies; study-to-study transport is weak relative to random-fold performance.
- Unrecorded materials, protocols and apparatus can dominate predictions.
- Feature-range warnings detect marginal range exceedance, not every multivariate distribution shift.
- Symmetric conformal intervals can extend below zero; they are reported as generated and not clipped to create a misleading impression of coverage.
- SHAP is a model attribution, not a causal effect.
- Search quality depends on the deployed model, selected ranges and uncertainty estimate; candidate ranking requires experimental confirmation.
