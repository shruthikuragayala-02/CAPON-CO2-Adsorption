"""Developer-selectable training options: model families and missing-value strategies.

Kept free of heavy imports (optuna/shap) so API routers can import it cheaply.
The imputer is always stored under the pipeline step name 'imputer' because SHAP,
the prediction service and the uncertainty code look it up by that name.
"""
from __future__ import annotations

DEFAULT_IMPUTATION = 'median'

IMPUTATION_STRATEGIES = {
    'median': {'label': 'Median', 'description': 'Replace gaps with the column median. Robust to outliers; the long-standing default.'},
    'mean': {'label': 'Mean', 'description': 'Replace gaps with the column average. Simple, but pulled by extreme values.'},
    'most_frequent': {'label': 'Mode (most frequent)', 'description': 'Replace gaps with the most common value. Best for flag-like or discrete columns.'},
    'constant': {'label': 'Constant (0)', 'description': 'Fill every gap with 0. Treats "not reported" as its own signal.'},
    'knn': {'label': 'KNN (5 neighbours)', 'description': 'Fill from the 5 most similar experiments. Uses relationships between columns; slower.'},
    'iterative': {'label': 'Iterative (MICE-style)', 'description': 'Predict each gap from the other columns, round by round. Most flexible, slowest.'},
}

MODEL_CATALOG = {
    'RandomForest': {'label': 'Random Forest', 'module': None, 'description': 'Bagged trees. Stable on small datasets and gives tree-spread uncertainty.'},
    'ExtraTrees': {'label': 'Extra Trees', 'module': None, 'description': 'Randomised trees. Faster and smoother than Random Forest.'},
    'GradientBoosting': {'label': 'Gradient Boosting', 'module': None, 'description': 'Sequential boosted trees. Strong on tabular data, can overfit with few studies.'},
    'XGBoost': {'label': 'XGBoost', 'module': 'xgboost', 'description': 'Optimised gradient boosting. Needs the xgboost package.'},
    'LightGBM': {'label': 'LightGBM', 'module': 'lightgbm', 'description': 'Leaf-wise gradient boosting. Needs the lightgbm package.'},
    'CatBoost': {'label': 'CatBoost', 'module': 'catboost', 'description': 'Ordered boosting. Needs the catboost package.'},
}


def _importable(module):
    if module is None: return True
    try:
        __import__(module); return True
    except Exception: return False


def available_models() -> dict:
    """Model id -> metadata incl. an 'available' flag (optional libraries may be missing)."""
    return {k: {**{x: v[x] for x in ('label', 'description')}, 'available': _importable(v['module'])} for k, v in MODEL_CATALOG.items()}


def validate_imputation(strategy: str) -> str:
    if strategy not in IMPUTATION_STRATEGIES:
        raise ValueError(f"Unknown imputation strategy '{strategy}'. Choose one of: {', '.join(IMPUTATION_STRATEGIES)}")
    return strategy


def build_imputer(strategy: str = DEFAULT_IMPUTATION, add_indicator: bool = True, seed: int = 42):
    """Return an sklearn imputer for the chosen missing-value strategy."""
    validate_imputation(strategy)
    if strategy in ('mean', 'median', 'most_frequent'):
        from sklearn.impute import SimpleImputer
        return SimpleImputer(strategy=strategy, add_indicator=add_indicator)
    if strategy == 'constant':
        from sklearn.impute import SimpleImputer
        return SimpleImputer(strategy='constant', fill_value=0, add_indicator=add_indicator)
    if strategy == 'knn':
        from sklearn.impute import KNNImputer
        return KNNImputer(n_neighbors=5, add_indicator=add_indicator)
    from sklearn.experimental import enable_iterative_imputer  # noqa: F401
    from sklearn.impute import IterativeImputer
    return IterativeImputer(max_iter=10, initial_strategy='median', random_state=seed, add_indicator=add_indicator)
