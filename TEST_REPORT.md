# Verification report

Executed on 2026-11-07 in the project workspace. This report records actual checks only.

## Training and model runtime

- Installed pinned requirements, including Optuna 4.2.1 and SHAP 0.47.2.
- Ran `python -m ml.train --data ../../data/mgo_database_source_normalized.csv --out .. --quick --seed 42 --alpha 0.10` from `backend`; completed with 10 trials per study.
- Selected artifact: `mgo-20261107-161120` (RandomForest, 47 features). Actual nested grouped RF scores: R² 0.210249; MAE 157.7223 mg/g; RMSE 205.2847 mg/g = 4.664501 mmol/g.
- Nominal 90% interval target; measured pooled outer-fold held-out coverage 92.7536%, mean interval width 785.9349 mg/g. Coverage is reported as observed, not forced to target. See `backend/reports/evaluation.json`.
- Runtime smoke test on a named form record: prediction 283.8130 mg/g; interval 43.8036–523.8223 mg/g; no range warning for the test record; Tree SHAP returned all 58 transformed contributions and reconstructed the model prediction with zero reported sum delta. `explain=False` returned no SHAP payload while preserving interval values.
- Verified that single-row inference disables row-wise constant-column pruning before aligning to the stored feature list; this avoids zero-filled feature regressions.

## Backend

- Python `py_compile` checks passed for the feature builder, trainer, schemas, routes and prediction service.
- `pytest -q backend/tests` — **14 passed**. Covers data/feature contracts, GroupKFold study separation, unit conversion, artifact reload/reference predictions, health/model-info serialization, auth/RBAC/history, prediction intervals and additive SHAP, fast batch prediction, old artifact null uncertainty, and optimization temperature hard bounds.
- Upstream warnings: Starlette/AnyIO portal deprecation plus matplotlib/pyparsing deprecations during API SHAP plotting. No test failures.

## Frontend

- `npm test` — **6 passed** (login, mg/g and mmol/g interval/contribution display, confidence status, additive Tree SHAP UI, optimizer objective/search, batch uncertainty columns, history and analysis rendering).
- `npm run build` — passed on Vite 6.3.5.
- Vite reports a non-fatal main-chunk warning (about 673 kB minified / 189 kB gzip); code splitting is a future optimization.
- Styles include 380px-and-below responsive layout rules. No manual device/accessibility audit was run.

## Not verified

No exhaustive browser automation, screen-reader/assistive-technology audit, real Android/iOS build, production deployment, concurrent multiworker load test, transactional dataset rollback drill, or live email reset workflow was executed. No claim is made that those checks passed.
