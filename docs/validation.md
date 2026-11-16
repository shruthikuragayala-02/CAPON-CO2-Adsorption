# Validation protocol

## Primary study-transfer estimate

The target is kept in mg/g. Five outer `GroupKFold` splits hold complete Study IDs out. For every candidate and outer split, Optuna TPE tuning runs within the outer training data using grouped 3-fold CV. The objective is mean grouped inner RMSE; `MedianPruner` can prune trials. Optional XGBoost, LightGBM and CatBoost candidates are enabled only when installed. The currently used quick profile runs 10 trials per study; the default full profile is 50.

The outer held-out predictions are pooled for R², MAE, MSE and RMSE in mg/g. RMSE in mmol/g is converted as RMSE (mg/g) ÷ 44.01. Random 5-fold baseline-settings scores are reported separately and are not used for algorithm selection.

## Adaptive interval evaluation

Inside each outer training partition, grouped inner out-of-fold residuals train a feature-dependent absolute-error scale model; that scale model is cross-fitted by Study ID. Normalized residual scores are calibrated only from the relevant training groups. The held-out outer group predictions and fold-specific conformal intervals are then used to report actual pooled empirical coverage and mean width. Coverage is not rescaled to meet the nominal target. With a small number of studies, the result is noisy and is not a prospective guarantee.

The deployed residual-scale model uses nested out-of-fold residuals. Its quantile is pooled from normalized scores of outer-held-out study groups. This provides a cross-validation-calibrated interval estimate; exchangeability can fail under study/distribution shift.

## Selection and deployment

Candidate selection uses nested grouped RMSE among TreeExplainer-supported models, not random CV. The final selected model runs an Optuna grouped study on the full dataset and is refit for deployment. Its full-data fit is distinct from out-of-fold validation. The artifact preserves `model`, `features`, `version`, `metadata`; fold metrics and Study IDs remain in `backend/reports/evaluation.json`.

## Current observed run

The active quick-profile run (10 trials per study, seed 42) selected RandomForest. Nested grouped R² 0.210249, MAE 157.7223 mg/g, RMSE 205.2847 mg/g (4.664501 mmol/g). Nominal 90% interval empirical pooled outer coverage was 92.7536%; mean width 785.9349 mg/g. See the saved evaluation JSON for all candidate and fold metrics.

## Scope and interpretation

The current path includes Optuna, SHAP and normalized conformal intervals. No target transform is used. Local SHAP and global SHAP/importance summaries explain model behavior, not causal effects. Feature-range OOD flags are univariate and do not detect all multivariate shift. The current empirical coverage is the observed result for this run only; retraining or data updates must create new model/report versions.
