import sys
from pathlib import Path
import numpy as np, pandas as pd, pytest
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ml.options import IMPUTATION_STRATEGIES, available_models, build_imputer, validate_imputation


@pytest.mark.parametrize('strategy', list(IMPUTATION_STRATEGIES))
@pytest.mark.parametrize('indicator', [True, False])
def test_every_imputer_fills_gaps_and_names_features(strategy, indicator):
    rng = np.random.default_rng(0)
    X = pd.DataFrame(rng.normal(size=(60, 5)), columns=list('abcde'))
    X.iloc[::5, 1] = np.nan
    imp = build_imputer(strategy, indicator, seed=1).fit(X)
    out = imp.transform(X)
    assert not np.isnan(out).any()
    assert out.shape[1] == len(imp.get_feature_names_out(list(X.columns)))
    assert (out.shape[1] > 5) == indicator


def test_unknown_imputation_rejected():
    with pytest.raises(ValueError):
        validate_imputation('magic')


def test_core_models_always_available():
    info = available_models()
    assert all(info[m]['available'] for m in ('RandomForest', 'ExtraTrees', 'GradientBoosting'))
