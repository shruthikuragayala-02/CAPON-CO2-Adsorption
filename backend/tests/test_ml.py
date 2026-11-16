import json,sys
from pathlib import Path
import joblib,numpy as np,pandas as pd
from sklearn.model_selection import GroupKFold
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'backend'))
from ml.features import build_features
from ml.train import load_source,metric_row
from app.config import MODEL_PATH
DATA=ROOT/'data/mgo_database_source_normalized.csv'
def test_dataset_and_feature_order():
 raw,y,g=load_source(DATA); X=build_features(raw)
 assert len(raw)==345 and g.nunique()==22 and len(y)==345
 assert X.columns.is_unique and X.shape[1]==47
 assert list(X.columns[:5])==['active_pct','is_MgO_CaCO3','prec_nitrate','prec_acetate','prec_carbonate_hydroxide']
 assert 'capacity' not in X and 'study' not in X and 21 not in X.columns and 40 not in X.columns
 assert list(X.columns)==list(build_features(raw).columns)
def test_nan02_formula_and_melting_point():
 row={i:np.nan for i in range(41)}
 row.update({2:'MgO',3:'Mg(NO3)2',6:'NaNO2',7:'1',8:'Impregnation',9:90,10:'N2',12:100,13:400,14:30,15:'CO2',17:100,18:80,19:300,20:120,36:100,37:.5,38:20,39:'Fixed bed'})
 other=dict(row); other.update({6:'',7:''})
 other2=dict(row); other2.update({6:'KNO3',7:'1'})
 X=build_features(pd.DataFrame([row,other,other2],columns=range(41)))
 assert X.iloc[0]['promo_nitrite']==1
 assert X.iloc[0]['frac_NO2']==1.0
 assert X.iloc[0]['frac_tm_min']==271
 assert X.iloc[0]['ads_minus_Tm_min']==29

def test_grouped_splits_do_not_overlap_studies():
 raw,y,g=load_source(DATA)
 folds=list(GroupKFold(5).split(raw,y,g))
 assert len(folds)==5
 for tr,te in folds: assert set(g.iloc[tr]).isdisjoint(set(g.iloc[te]))
def test_metric_conversion_is_exact():
 m=metric_row(np.array([0.,10.,20.]),np.array([1.,8.,22.]))
 assert np.isclose(m['rmse_mmol_g'],m['rmse_mg_g']/44.01)
 assert m['r2']==float(m['r2'])
def test_model_save_reload_reference_prediction():
 assert MODEL_PATH.exists(),f'Model artifact is absent: {MODEL_PATH}'
 obj=joblib.load(MODEL_PATH); raw,y,g=load_source(DATA); X=build_features(raw).reindex(columns=obj['features'],fill_value=0)
 pred1=np.asarray(obj['model'].predict(X.iloc[:5])); obj2=joblib.load(MODEL_PATH); pred2=np.asarray(obj2['model'].predict(X.iloc[:5]))
 np.testing.assert_allclose(pred1,pred2,rtol=0,atol=1e-10)
 assert np.isfinite(pred1).all()

def test_reference_predictions_file():
 p=ROOT/'backend/reports/reference_predictions.json'
 if p.exists():
  ref=json.loads(p.read_text());obj=joblib.load(MODEL_PATH);raw,y,g=load_source(DATA);X=build_features(raw).reindex(columns=obj['features'],fill_value=0)
  now=np.asarray(obj['model'].predict(X.iloc[:len(ref['predictions_mg_g'])]))
  np.testing.assert_allclose(now,ref['predictions_mg_g'],rtol=0,atol=1e-10)

def test_feature_parity_with_frozen_original_formula_reference():
    from reference_original_features import build_features as original_features
    raw,y,g=load_source(DATA)
    # Exclude rows using the specifically corrected promoter formula; all other
    # feature transforms must remain identical to the pre-extraction reference.
    mask=~raw[6].fillna('').astype(str).str.contains('NaNO2',case=False,regex=False)
    source=raw.loc[mask].reset_index(drop=True)
    got=build_features(source); expected=original_features(source)
    assert list(got.columns)==list(expected.columns)
    pd.testing.assert_frame_equal(got,expected,check_exact=True)
