"""Step-by-step data preprocessing for the CAPON models (RandomForest, ExtraTrees,
GradientBoosting, XGBoost/LightGBM/CatBoost if installed, and the ANN).

Run from the backend folder:
    python -m ml.preprocess_export
    python -m ml.preprocess_export --imputation knn

It writes three CSV files to <project>/data/preprocessed/ :
  1_features_raw.csv        47 engineered features + target + study id. Gaps (NaN) are kept.
                            This is exactly what the tree models receive (they impute inside the pipeline).
  2_features_imputed.csv    Same rows after the chosen imputer (+ "missing indicator" columns).
  3_features_ann_ready.csv  Imputed AND standardized (mean 0, std 1). This is what the ANN receives.

IMPORTANT: files 2 and 3 are for inspection only. During real training the imputer and
scaler are re-fitted inside every cross-validation fold, so that test studies never leak
into the statistics. Never train a model from files 2 or 3.
"""
from __future__ import annotations
import argparse, re
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler

try:
    from .features import build_features
    from .options import build_imputer, DEFAULT_IMPUTATION, IMPUTATION_STRATEGIES
except ImportError:  # run as a plain script
    from features import build_features
    from options import build_imputer, DEFAULT_IMPUTATION, IMPUTATION_STRATEGIES


def _parse_num(v):
    if pd.isna(v): return np.nan
    m = re.search(r"[-+]?\d*\.?\d+", str(v).replace('~', ''))
    return float(m.group()) if m else np.nan


def load_source(path: Path):
    """Same contract as ml.train.load_source (kept here so this script needs no optuna/shap)."""
    raw = pd.read_csv(path, header=None, encoding='utf-8', engine='python', on_bad_lines='skip')
    if raw.shape[1] < 41: raise ValueError(f'Expected >=41 source columns; found {raw.shape[1]}')
    raw = raw.iloc[:, :41].copy()
    raw = raw[pd.to_numeric(raw[0], errors='coerce').notna()].reset_index(drop=True)
    capacity = raw[21].map(_parse_num); study = raw[40].map(_parse_num)
    ok = capacity.notna() & study.notna()
    return raw.loc[ok].reset_index(drop=True), capacity[ok].reset_index(drop=True), study[ok].astype(int).reset_index(drop=True)


def main():
    here = Path(__file__).resolve().parent
    ap = argparse.ArgumentParser()
    ap.add_argument('--data', default=str(here / '../../data/mgo_database_source_normalized.csv'))
    ap.add_argument('--out', default=str(here / '../../data/preprocessed'))
    ap.add_argument('--imputation', default=DEFAULT_IMPUTATION, choices=list(IMPUTATION_STRATEGIES))
    ap.add_argument('--no-missing-indicator', action='store_true')
    a = ap.parse_args()
    data, out = Path(a.data).resolve(), Path(a.out).resolve()
    out.mkdir(parents=True, exist_ok=True)

    # STEP 1 - load the 41-column raw table, keep rows with a numeric capacity and study id
    raw, y, groups = load_source(data)
    print(f'[1] loaded raw table: {raw.shape[0]} rows x {raw.shape[1]} columns, {groups.nunique()} studies')

    # STEP 2 - feature engineering (text -> numbers, one-hot flags, ratios). Capacity/study are NOT features.
    X = build_features(raw)
    all_nan = X.columns[X.isna().all()]
    if len(all_nan): X = X.drop(columns=all_nan)
    print(f'[2] engineered features: {X.shape[1]} columns' + (f' (dropped all-empty: {list(all_nan)})' if len(all_nan) else ''))
    miss = X.isna().sum(); miss = miss[miss > 0].sort_values(ascending=False)
    print(f'    columns with missing values: {len(miss)}')
    for c, n in miss.head(10).items(): print(f'      {c:<32} {n:>4} missing ({100*n/len(X):.0f}%)')

    flat = pd.concat([X, y.rename('capacity_mg_g'), groups.rename('study_id')], axis=1)
    flat.to_csv(out / '1_features_raw.csv', index=False)

    # STEP 3 - imputation (what the tree models do inside their pipeline)
    imp = build_imputer(a.imputation, not a.no_missing_indicator, seed=42).fit(X)
    Xi = imp.transform(X)
    names = list(imp.get_feature_names_out(list(X.columns)))
    Xi_df = pd.DataFrame(Xi, columns=names)
    print(f'[3] imputed with "{a.imputation}": {Xi_df.shape[1]} columns (incl. {Xi_df.shape[1]-X.shape[1]} missing-indicator columns), NaN left: {int(Xi_df.isna().sum().sum())}')
    pd.concat([Xi_df, y.rename('capacity_mg_g'), groups.rename('study_id')], axis=1).to_csv(out / '2_features_imputed.csv', index=False)

    # STEP 4 - standardization (extra step needed ONLY by the ANN)
    Xs = StandardScaler().fit_transform(Xi_df)
    Xs_df = pd.DataFrame(Xs, columns=names)
    print(f'[4] standardized for ANN: mean≈{Xs_df.mean().abs().max():.2g}, std≈{Xs_df.std(ddof=0).replace(0, np.nan).mean():.2f} (constant columns stay 0)')
    pd.concat([Xs_df, y.rename('capacity_mg_g'), groups.rename('study_id')], axis=1).to_csv(out / '3_features_ann_ready.csv', index=False)
    print(f'\nSaved 3 files to {out}')


if __name__ == '__main__':
    main()
