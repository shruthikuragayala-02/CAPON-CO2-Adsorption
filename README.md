# CAPON — MgO–CO₂ Adsorption Platform

A research-screening application for estimating CO₂ adsorption capacity of MgO-based sorbents. The project combines study-aware model training, a FastAPI API, a React/Vite interface, SQLite auth/history, and a protected Developer Console.

> **Scientific use only:** predictions, intervals, explanations and optimizer suggestions are screening aids, not experimental guarantees. Validate promising conditions in the laboratory.

## Data provenance and audit

The supplied source is `data/source_original/MgO database 345.csv` (CSV rather than the XLSX name used in the original brief). The normalized copy is `data/mgo_database_source_normalized.csv`; source schema and the 41-column loader are retained. The audited dataset contains 345 observations and 22 distinct study IDs. Repair details, missingness and counts are recorded in `data/dataset_inspection.json`. No outlier candidates were silently removed. Capacity and study identifiers are never model features.

## Current trained model and observed results

The active artifact and reports were regenerated with the `--quick` Optuna profile (10 trials per study, seed 42, nominal interval level 90%). Source of truth: `backend/reports/evaluation.json`.

- Selected model: **RandomForest**, version **mgo-20261107-161120**; 47 engineered input features.
- HPO: Optuna TPE sampler + MedianPruner; continuous/log-scaled model-specific parameters; nested 5-fold Study-GroupKFold evaluation with 3-fold grouped inner tuning.
- Target and point predictions are maintained in mg/g. `mmol/g = mg/g ÷ 44.01`.

| Validation (selected RandomForest) | R² | MAE (mg/g) | RMSE (mg/g) | RMSE (mmol/g) |
|---|---:|---:|---:|---:|
| Random 5-fold baseline settings | 0.554329 | 102.7510 | 154.2121 | 3.504023 |
| Nested study-grouped 5-fold | 0.210249 | 157.7223 | 205.2847 | 4.664501 |

The nominal interval target is **90%**. Pooled held-out outer-fold grouped coverage was **92.75%**, with mean interval width **785.93 mg/g** (17.86 mmol/g). Coverage is reported as observed; it is not forced to the target, is noisy with only 22 studies, and is not an individual-prediction guarantee. Prediction-time intervals use a feature-dependent residual scale and the normalized conformal quantile; OOD feature-range violations widen the interval and lower the confidence badge. Older artifacts without calibration return null uncertainty and an explanatory message, never a fabricated global-RMSE interval.

Detailed per-fold metrics, scores, HPO history/importance, calibration details, SHAP figures and model comparison files live in `backend/reports/`. The random-CV comparator may mix records from the same paper across folds; the grouped outer test folds keep whole studies together. Selecting among algorithms can add optimism, so nested grouped results are useful estimates rather than prospective guarantees.

## Features

- **Prediction:** reports point capacity in both units, locally adaptive conformal interval, width-based confidence status, feature-range/OOD warnings and additive local `shap.TreeExplainer` contributions on the pipeline-imputed matrix.
- **Batch:** CSV/Excel input, prediction and interval/confidence/OOD columns; SHAP is disabled per row for speed. CSV results are downloadable.
- **Optimization:** Optuna TPE condition search, up to five distinct candidates, predicted-mean or risk-adjusted objective (`capacity − k × local error scale`), OOD penalty, and hard adsorption temperature/time maxima.
- **Analysis:** random vs nested grouped validation, actual interval coverage/width, Tree SHAP global reports, Optuna history and parameter importance, dataset summary and permutation importance.
- **Developer Console:** dataset versioning, train candidate, inspect HPO summary, review jobs, and explicitly deploy/rollback model candidates. Candidate training does not replace the active model automatically.
  - **Model choice:** train one model (fast) or compare several (RandomForest, ExtraTrees, GradientBoosting, plus XGBoost/LightGBM/CatBoost when installed); the lowest study-grouped RMSE among the chosen models becomes the candidate.
  - **Missing-value handling:** median (default), mean, mode, constant 0, KNN or iterative (MICE-style) filling, with optional “was missing” indicator columns. A missing-value profile of the dataset is shown next to the controls.
  - Also configurable per run: Optuna trials, random seed, interval level (80/90/95%) and a time cap per study. Presets: Fast preview / Balanced / Thorough.
  - CLI equivalent: `python -m ml.train --models RandomForest,ExtraTrees --imputation knn --trials 25`.
- **Sign in:** one login screen with a *Research user / Developer* switch.
- Existing authentication, user-scoped prediction history, unit toggle, route structure, Capacitor/PWA configuration, source loader and database schema are retained.

## Project layout

```text
backend/app/                 FastAPI routes, schemas, auth, SQLite and prediction service
backend/ml/                  41-column loader, feature builder, Optuna training
backend/saved_models/        active and versioned joblib artifacts
backend/reports/             evaluation, HPO, calibration, SHAP and figures
backend/tests/               ML, API, validation, and upload tests
frontend/src/                React pages, API client, auth context and CSS
frontend/public/              PWA assets
frontend/src/pages/           prediction, analysis, optimizer, batch, history, help, developer
frontend/src/pages/pages.test.jsx  mocked React interaction tests
data/                         source, normalized data, versions and audit report
docs/                         model card, API details and training/calibration notes
```

## Requirements

- Python 3.11+ (tested with Python 3.13), pip
- Node.js 20+ and npm
- Optional mobile packaging: Android Studio/SDK; macOS/Xcode for iOS

Python packages are pinned in `backend/requirements.txt`, including `optuna==4.2.1` and `shap==0.47.2`. XGBoost, LightGBM and CatBoost model families are considered only if their packages are already installed; they are not mandatory dependencies.

## Setup and run

### Windows

1. Extract the ZIP to a writable folder and install Python and Node.js.
2. Run `setup_windows.bat`; it creates the virtual environment, installs Python packages and npm dependencies, and initializes `.env` from `.env.example`.
3. Set a strong `JWT_SECRET` (at least 32 random characters) and `DEVELOPER_PASSWORD` in `.env`. Keep `.env` private. Use `COOKIE_SECURE=true` behind HTTPS and set the exact frontend origin in `CORS_ORIGINS` for production.
4. Run `start_backend.bat` and `start_frontend.bat` in separate terminals, or use `start_all.bat`.
5. Open <http://localhost:5173>; API docs are at <http://localhost:8000/docs>.

### Cross-platform manual commands (from project root)

```bash
python -m venv .venv
# Windows PowerShell: .venv\Scripts\Activate.ps1
# macOS/Linux: source .venv/bin/activate
python -m pip install -r backend/requirements.txt
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

In another terminal:

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0
```

Vite proxies `/api` to FastAPI in local development. Set `VITE_API_URL` at frontend build time for a separately hosted API or native mobile app.

## Retrain

From the project root, the reproducible **quick** profile runs 10 trials per study:

```bash
# Cross-platform; paths are resolved relative to backend/ml/train.py
cd backend
python -m ml.train --data ../../data/mgo_database_source_normalized.csv --out .. --quick --seed 42 --alpha 0.10
```

The full default is **50 trials per study**; specify a higher/lower count or time limit explicitly if needed:

```bash
cd backend
python -m ml.train --data ../../data/mgo_database_source_normalized.csv --out .. --trials 50 --seed 42 --alpha 0.10
# Optional: --timeout-seconds 3600
```

`train_model.bat` runs the quick profile on Windows. Training writes a versioned artifact, evaluation/HPO/SHAP reports and `backend/saved_models/active_model.joblib`. The Developer Console uses staged candidate artifacts and requires explicit deployment confirmation. Capacity is never converted to mmol/g inside fitting; only reported mmol/g metrics/values are divided by 44.01.

## Database, authentication, Docker and mobile

SQLite schema initializes on backend startup. The default DB is `backend/app.db`; `DATABASE_PATH` can override it. `docker-compose.yml` persists the DB at `/app/state/app.db` through a named volume. User prediction history is always scoped to the authenticated user. Set `DEVELOPER_PASSWORD` before first developer login (`/developer-login`, username `developer`); developer auth is separate from user registration.

For Docker, copy `.env.example` to `.env`, set secrets, then run `docker compose up --build`. Use HTTPS and a production reverse proxy before external deployment.

PWA assets and Capacitor configuration remain included. After setting `VITE_API_URL` to the deployed HTTPS API, run `cd frontend && npm run cap:sync`; use `npx cap open android` or `npx cap open ios` with their respective toolchains.

## Tests

From project root:

```bash
python -m py_compile backend/ml/train.py backend/app/schemas.py backend/app/routers/*.py backend/app/services/prediction_service.py
pytest -q backend/tests
cd frontend
npm test
npm run build
```

Tests cover feature/data parity, grouped study separation, unit conversion, artifact reload, legacy no-calibration behavior, optimizer hard bounds, API/auth/history, batch prediction and mocked UI interactions for both units, uncertainty, SHAP, optimizer and batch result columns. The frontend build currently emits a non-fatal large-chunk advisory due to the included charting/UI dependencies.

See [API.md](API.md), [model_card.md](model_card.md), [docs/OPTUNA_SHAP_CALIBRATION.md](docs/OPTUNA_SHAP_CALIBRATION.md) and [REQUIREMENTS_DIFF.md](REQUIREMENTS_DIFF.md). The FastAPI OpenAPI schema is at `/docs`.
