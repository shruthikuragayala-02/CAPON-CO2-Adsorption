# Training, uncertainty, SHAP and optimization notes

## Reproduce the current run

From project root, activate the Python environment and run:

```bash
python -m pip install -r backend/requirements.txt
cd backend
python -m ml.train --data ../../data/mgo_database_source_normalized.csv --out .. --quick --seed 42 --alpha 0.10
```

The quick option sets 10 Optuna trials per study. Omitting `--quick` uses 50 trials per study by default. Add `--timeout-seconds 3600` to bound each study search. The current report/artifact is `mgo-20261107-161120`, from the quick profile.

## Nested study-grouped tuning

- The existing normalized source loader continues to read 41 source columns; target is source column 21, Study ID column 40.
- `build_features` is the existing 47-feature training builder. Inference disables row-wise constant-column pruning before reindexing onto the stored training feature order.
- The primary score is nested 5-fold GroupKFold, with whole Study IDs held out in every outer fold. Each outer training split runs grouped 3-fold Optuna tuning.
- TPE optimizes mean grouped inner-fold RMSE in mg/g. `MedianPruner` can stop inferior trials. Numeric search dimensions include continuous ranges and log-scaled learning rates/regularization where appropriate.
- Each outer-fold predictor and uncertainty calibration is trained without the outer test groups. Pooling held-out scores produces the reported empirical coverage.
- Random 5-fold baseline settings are reported separately and are not used for selected-model choice.
- Training artifact maintains `{model, features, version, metadata}` for loader compatibility.

## Normalized conformal intervals

Within each outer training partition, inner GroupKFold produces out-of-fold point residuals. A separate scale model is cross-fitted by Study ID to estimate absolute residual magnitude without fitting the scale estimate on the same study. Normalized calibration scores are `abs(y − prediction) / max(sigma(x), epsilon)`. The finite-sample quantile rank is `min(n, ceil((n + 1) × (1 − alpha)))`.

For a test point in an outer fold, the interval is `prediction ± q × sigma(x)`. The final deployed scale model is fit to nested out-of-fold absolute residuals, and its normalized quantile is pooled from outer-held-out study scores. Pooled coverage is computed only from held-out outer fold predictions/intervals. Cross-validation calibration is empirical and can miscalibrate under study shift; the report displays actual coverage, even if it misses target.

At runtime, numeric derived features outside training min/max are flagged. Each flagged feature widens the interval using the declared conservative factor and downgrades the width-based confidence badge. Range checks are not a complete multivariate OOD detector. Point estimates are not altered; intervals are not clipped at zero.

When calibration metadata is missing, result fields are null and the service explains that retraining is required. It never substitutes a global CV-RMSE width.

## SHAP

`shap.TreeExplainer` is trained/reloaded with a deterministic background sample from the fitted pipeline's imputed feature matrix. During prediction, raw named values pass through the unchanged feature builder and pipeline imputer before the fitted tree estimator is explained. The complete output includes base value plus all feature contributions in mg/g. A strict additivity tolerance detects substantive mismatch; only a small floating-point residual is assigned to the largest absolute contribution and reported as `additivity_adjustment_mg_g`. Batch and optimizer routes set `explain=False` to avoid per-row SHAP cost.

Global mean absolute SHAP importance, beeswarm/bar plots and dependence plots are model-interpretation summaries, not causal effects. They are computed on training data and do not represent held-out effects.

## Condition optimization

The prediction service is called with `explain=False`; uncertainty calibration must exist or risk-aware search returns a clear unavailable-calibration error. Optuna TPE proposes numeric free variables. Optimizer clips requested ranges to accepted schema domains and hard user maxima for adsorption temperature/time. It computes either point mean or `capacity − k × sigma(x)`, then applies an additional interval-width penalty to OOD candidates. Rounded duplicate condition sets are removed before returning the highest-scoring five. The search is an exploration aid, not an optimum guarantee.

## Current measured grouped results

The committed report records the quick-profile run (10 trials/study, seed 42): RandomForest nested grouped R² 0.210249, MAE 157.7223 mg/g, RMSE 205.2847 mg/g (4.664501 mmol/g). Nominal coverage is 90%; actual pooled outer-held-out coverage is 92.75% and mean width is 785.93 mg/g. These numbers should always be refreshed from `backend/reports/evaluation.json` after retraining.
