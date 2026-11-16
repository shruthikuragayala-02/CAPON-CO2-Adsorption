# API Reference

Local base URL: `http://localhost:8000`; interactive OpenAPI: `/docs`. Bearer tokens work for API clients; the browser uses HttpOnly cookies. Protected routes require authentication and role checks.

## Health, reports and model information

- `GET /health` — API/model health.
- `GET /model_info` — active model version, features and metadata.
- `GET /metrics` — saved validation sections.
- `GET /evaluation` — full evaluation, grouped fold metrics, HPO and calibration report.
- `GET /feature-importance` — training-set permutation importance (descriptive).
- `GET /shap/importance` — global mean absolute Tree SHAP values.
- `GET /hpo` — HPO summary, Optuna parameter importance and calibration summary.
- `GET /dataset` — audited dataset summary, not raw observations.
- `GET /reports/{name}` — available PNG reports: `feature_importance.png`, `target_distribution.png`, `optimization_history.png`, `shap_summary_beeswarm.png`, `shap_bar.png`.

Capacity remains in mg/g internally. `mmol/g = mg/g / 44.01`; RMSE follows the same conversion and R² is unchanged.

## Authentication

- `POST /auth/register` — `{ "username":"lab_user", "email":"name@example.org", "password":"at-least-10-chars" }`
- `POST /auth/login` — `{ "username":"lab_user", "password":"…" }`
- `POST /auth/developer-login` — developer credentials from environment.
- `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`
- `POST /auth/change-password`
- `POST /auth/forgot-password` — generic response; email delivery is not configured in this standalone build.
- `POST /developer/change-password` — developer only.

## Prediction

`POST /predict` requires a user or developer session. Request fields are optional named form values; missing data flows through the saved median imputer. Example:

```json
{
  "active_pct":85,"active_component":"MgO","precursor":"Mg(NO3)2·6H2O",
  "promoter":"NaNO3","ratio":"1","synthesis_method":"Impregnation",
  "pretreatment_gas":"N2","pretreatment_flow":100,
  "pretreatment_temperature":400,"pretreatment_time":30,
  "adsorption_gas":"CO2","co2_percentage":100,"adsorption_flow":80,
  "adsorption_temperature":300,"adsorption_time":120,
  "surface_area":100,"pore_volume":0.5,"pore_size":20,"application":"Fixed bed"
}
```

Response fields include:

- `capacity_mg_g`, `capacity_mmol_g`, `model_version`, `prediction_id`.
- `uncertainty`: `null` when the loaded artifact has no usable calibration; otherwise includes `sigma_mg_g`, lower/upper bounds in both units, `confidence_level`, method and relative interval width.
- `uncertainty_message`, `confidence_flag` (`high`, `medium`, `low`), `ood_warning`, `ood_features`.
- `local_explanation`: complete `SHAP TreeExplainer` decomposition in mg/g, or `null` when unavailable; includes base value, contributions, sum check and numerical correction.
- `model_std_mg_g`: across-tree spread when available (distinct from residual scale).

Older artifacts without calibration return null interval fields and a retraining message; no global-RMSE fallback is applied.

### Batch

- `POST /predict_batch` — multipart CSV/XLS/XLSX file, 1–500 rows. Returns individual results and `result_csv`. Results contain point prediction, interval when calibrated, confidence flag and OOD fields. SHAP is disabled per row for speed.
- `POST /predict_batch/json` — JSON list of 1–500 named raw records. Returns the same point/uncertainty fields and no local SHAP.

## Optimization

`POST /optimize/conditions` requires an authenticated user. Body fields:

```json
{
  "fixed":{"active_pct":85,"promoter":"NaNO3","ratio":"1"},
  "free":{"adsorption_temperature":[220,380],"adsorption_time":[30,240]},
  "objective_mode":"lower_bound","k":1.0,"ood_penalty":1.0,
  "n_trials":50,"timeout_seconds":null,"seed":42,
  "max_temperature":400,"max_time":240
}
```

`objective_mode` is `mean` or `lower_bound`; the latter maximizes point estimate minus `k × sigma(x)`. OOD candidates incur a configurable uncertainty-width penalty and remain flagged. Numeric ranges are intersected with accepted input domains and user maxima; infeasible ranges are rejected. Returns up to five distinct ranked candidates with conditions, predicted capacity, calibrated interval, confidence/OOD status and objective score; `convergence` contains the cumulative best objective. Optimization is model-guided screening, not a global guarantee.

## User history and explanation

- `GET /history?q=optional-search` — authenticated user’s records only.
- `GET /history/{prediction_id}` and `DELETE /history/{prediction_id}` — owner scoped.
- `GET /explain/{prediction_id}` — stored result/explanation, owner scoped.

## Developer data and administration

All routes below require developer role:

- `GET /developer/overview`, `GET /developer/dataset/versions`, `GET /developer/dataset/preview`
- `POST /developer/dataset/upload?mode=replace|append` — multipart source-schema data (41+ columns); validates target column 21 and Study ID column 40, then versions/audits upload.
- `POST /developer/dataset/rollback/{version}`
- `GET /developer/users`, `POST /developer/users/{id}/disable?disabled=true|false`
- `GET /developer/audit`, `GET /developer/health`

Full column mapping, record editing and preprocessing/outlier review workflows are not part of this interface.

## Training, HPO and deployment

Developer only:

- `POST /train` — body `{ "trials":50,"quick":false,"timeout_seconds":null,"seed":42,"alpha":0.1 }`; asynchronous staged candidate job. `quick:true` forces 10 trials per study. `iterations` is accepted as a backward-compatible trial alias.
- `GET /train/status`, `GET /train/history` — queued/running/completed/failed jobs, result JSON and HPO summary on completion.
- `POST /train/cancel` with `{ "job_id":"…" }` or `POST /train/cancel/{job_id}` — cooperative cancellation after active model work returns.
- `GET /developer/models` — candidate registry.
- `POST /developer/deploy` with `{ "version":"…","confirm":true }` — explicitly deploys an artifact and its reports, then reloads prediction runtime.
- `POST /developer/rollback/{version}` — deploy a retained candidate.

Training uses nested grouped evaluation (5 outer study-group folds, 3 grouped inner folds), Optuna TPE and MedianPruner. The full default is 50 trials per study. Optional XGBoost/LightGBM/CatBoost algorithms are only considered when installed. See `docs/OPTUNA_SHAP_CALIBRATION.md`.

## Status and limits

Validation errors return 422, unavailable active model returns 503 and rate limits return 429. In-memory rate limiting is single-process only; production should use a shared limiter, HTTPS, secure cookies, managed secrets and persistent backups.
