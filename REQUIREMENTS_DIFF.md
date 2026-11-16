# Requirements diff for the Optuna / SHAP upgrade

Added to `backend/requirements.txt`:

```diff
+optuna==4.2.1
+shap==0.47.2
```

`optuna==4.2.1` was already present in the immediately preceding requirements file and is retained/pinned for reproducible TPE and MedianPruner behavior. `shap==0.47.2` is the new pinned package for TreeExplainer.

Optional `xgboost`, `lightgbm`, and `catboost` packages are intentionally not added as mandatory dependencies; their estimator candidates are conditionally enabled only when the corresponding package is installed. The full changed sources are included in this project folder and in `MgO_CO2_Platform.zip` after final verification.
