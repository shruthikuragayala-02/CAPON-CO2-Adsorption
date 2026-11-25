import os,tempfile,sys
from pathlib import Path
_test_db=Path(tempfile.gettempdir())/'mgo_co2_test.sqlite'
if _test_db.exists(): _test_db.unlink()
os.environ['DATABASE_PATH']=str(_test_db)
os.environ['JWT_SECRET']='test-only-random-secret-0123456789-abcdef-0123456789'
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'backend'))
from fastapi.testclient import TestClient
from app.main import app
import app.routers.auth as auth
from app.security.auth import hash_password

def test_health_and_model_info():
 with TestClient(app) as c:
  assert c.get('/health').status_code==200
  assert 'loaded' in c.get('/model_info').json()
def test_auth_prediction_and_user_history_isolation():
 with TestClient(app) as c:
  r=c.post('/auth/register',json={'username':'alice_test','email':'alice@example.org','password':'test-password-123'});assert r.status_code==200,r.text
  token=r.json()['access_token'];h={'Authorization':'Bearer '+token}
  data={'active_pct':85,'active_component':'MgO','precursor':'Mg(NO3)2·6H2O','promoter':'NaNO2','ratio':'1','synthesis_method':'Impregnation','pretreatment_gas':'N2','pretreatment_flow':100,'pretreatment_temperature':400,'pretreatment_time':30,'adsorption_gas':'CO2','co2_percentage':100,'adsorption_flow':80,'adsorption_temperature':300,'adsorption_time':120,'surface_area':100,'pore_volume':.5,'pore_size':20,'application':'Fixed bed'}
  pred=c.post('/predict',json=data,headers=h);assert pred.status_code==200,pred.text
  body=pred.json();assert body['capacity_mmol_g']==body['capacity_mg_g']/44.01
  assert body['uncertainty'] is not None and body['uncertainty']['upper_mg_g']>body['uncertainty']['lower_mg_g']
  assert body['ood_warning'] is False
  if body['local_explanation'] is not None: assert abs(body['local_explanation']['sum_check']-body['capacity_mg_g'])<1e-6
  own=c.get('/history',headers=h).json();assert own['count']==1
  assert c.get('/history').json()['count']==1  # browser session uses HttpOnly access cookie
  r2=c.post('/auth/register',json={'username':'bob_test','email':'bob@example.org','password':'test-password-123'});assert r2.status_code==200
  h2={'Authorization':'Bearer '+r2.json()['access_token']};assert c.get('/history',headers=h2).json()['count']==0
  assert c.get('/developer/overview',headers=h).status_code==403
  batch=c.post('/predict_batch/json',json=[data],headers=h);assert batch.status_code==200,batch.text
  assert batch.json()['results'][0]['local_explanation'] is None
  assert 'uncertainty' in batch.json()['results'][0]

def test_developer_auth_and_protected_routes(monkeypatch):
 auth.DEV_PASSWORD='test-developer-password';auth._dev_hash=hash_password(auth.DEV_PASSWORD)
 with TestClient(app) as c:
  r=c.post('/auth/developer-login',json={'username':'developer','password':'test-developer-password'});assert r.status_code==200,r.text
  h={'Authorization':'Bearer '+r.json()['access_token']};assert c.get('/developer/overview',headers=h).status_code==200
  assert c.get('/developer/users',headers=h).status_code==200
  assert c.get('/developer/overview').status_code==200  # HttpOnly browser cookie
 with TestClient(app) as no_session:
  assert no_session.get('/developer/overview').status_code==401

def test_grouped_metrics_and_dataset_report():
 with TestClient(app) as c:
  r=c.get('/evaluation');assert r.status_code==200
  report=r.json();chosen=report['model']['name'];m=report['validation']['study_grouped_nested_5_fold'][chosen]['metrics']
  assert abs(m['rmse_mmol_g']-m['rmse_mg_g']/44.01)<1e-12
  assert c.get('/dataset').json()['valid_target_and_study_rows']==345

def test_legacy_artifact_has_neutral_uncertainty(monkeypatch):
 from app.services.prediction_service import runtime
 original=runtime.payload
 payload=dict(original);payload['metadata']=dict(original.get('metadata',{}));payload['metadata'].pop('uncertainty',None);payload['metadata'].pop('shap',None)
 monkeypatch.setattr(runtime,'payload',payload)
 try:
  result=runtime.predict([{'active_pct':85,'active_component':'MgO','precursor':'Mg(NO3)2','promoter':'NaNO2','ratio':'1','synthesis_method':'Impregnation','pretreatment_gas':'N2','pretreatment_flow':100,'pretreatment_temperature':400,'pretreatment_time':30,'adsorption_gas':'CO2','co2_percentage':100,'adsorption_flow':80,'adsorption_temperature':300,'adsorption_time':120,'surface_area':100,'pore_volume':.5,'pore_size':20,'application':'Fixed bed'}],explain=False)
  assert result['uncertainty'] is None
  assert result['uncertainty_estimate_mg_g'] is None
  assert result['prediction_range_mg_g'] is None
  assert 'no calibration' in result['uncertainty_message'].lower()
 finally: monkeypatch.setattr(runtime,'payload',original)


def test_optimizer_obeys_hard_temperature_bound(monkeypatch):
 from app.routers import optimization

 original_payload = optimization.runtime.payload
 original_predict = optimization.runtime.predict
 original_predict_batch = optimization.runtime.predict_batch

 monkeypatch.setattr(optimization.runtime, 'payload', {'model': 'test'})

 def fake_predict(records, explain=True, persist_user=None, include_model_std=True):
  value = float(records[0]['adsorption_temperature'])
  return {
   'capacity_mg_g': value * 2,
   'capacity_mmol_g': value * 2 / 44.01,
   'uncertainty': {
    'sigma_mg_g': 10,
    'std_mg_g': 10,
    'std_mmol_g': 10 / 44.01,
    'lower_mg_g': value * 2 - 20,
    'upper_mg_g': value * 2 + 20,
    'lower_mmol_g': (value * 2 - 20) / 44.01,
    'upper_mmol_g': (value * 2 + 20) / 44.01,
    'confidence_level': .9,
    'method': 'test',
    'relative_width_pct': 20
   },
   'confidence_flag': 'high',
   'ood_warning': False,
   'ood_features': []
  }

 def fake_predict_batch(records, persist_user=None, explain=False, include_model_std=False):
  return [
   fake_predict(
    [record],
    explain=explain,
    persist_user=persist_user,
    include_model_std=include_model_std
   )
   for record in records
  ]

 monkeypatch.setattr(optimization.runtime, 'predict', fake_predict)
 monkeypatch.setattr(optimization.runtime, 'predict_batch', fake_predict_batch)

 try:
  with TestClient(app) as c:
   c.post('/auth/register', json={
    'username': 'optimizer_test',
    'email': 'optimizer@example.org',
    'password': 'test-password-123'
   })
   login = c.post('/auth/login', json={
    'username': 'optimizer_test',
    'password': 'test-password-123'
   })
   token = login.json()['access_token']
   h = {'Authorization': 'Bearer ' + token}

   out = c.post('/optimize/conditions', json={
    'fixed': {},
    'free': {'adsorption_temperature': [350, 500]},
    'max_temperature': 400,
    'n_trials': 3,
    'seed': 3
   }, headers=h)

   assert out.status_code == 200, out.text
   assert len(out.json()['top_candidates']) <= 5
   assert all(
    x['conditions']['adsorption_temperature'] <= 400
    for x in out.json()['top_candidates']
   )

   assert out.json()['dopant_formulations_screened'] == len(
    optimization.DOPANT_FORMULATIONS
   )

   for candidate in out.json()['top_candidates']:
    assert candidate['dopant_comparison_count'] == len(
     optimization.DOPANT_FORMULATIONS
    )

 finally:
  monkeypatch.setattr(optimization.runtime, 'payload', original_payload)
  monkeypatch.setattr(optimization.runtime, 'predict', original_predict)
  monkeypatch.setattr(optimization.runtime, 'predict_batch', original_predict_batch)


def test_training_options_and_request_validation():
 auth.DEV_PASSWORD='test-developer-password';auth._dev_hash=hash_password(auth.DEV_PASSWORD)
 with TestClient(app) as c:
  r=c.post('/auth/developer-login',json={'username':'developer','password':'test-developer-password'});assert r.status_code==200,r.text
  h={'Authorization':'Bearer '+r.json()['access_token']}
  o=c.get('/train/options',headers=h);assert o.status_code==200,o.text
  body=o.json();ids={m['id'] for m in body['models']}
  assert {'RandomForest','ExtraTrees','GradientBoosting'}<=ids
  assert {x['id'] for x in body['imputation']}=={'median','mean','most_frequent','constant','knn','iterative'}
  assert c.post('/train',json={'models':['NotAModel']},headers=h).status_code==422
  assert c.post('/train',json={'imputation':'magic'},headers=h).status_code==422
  miss=c.get('/developer/dataset/missing',headers=h);assert miss.status_code==200,miss.text
  assert miss.json()['features_with_missing']>0
 with TestClient(app) as anon:
  assert anon.get('/train/options').status_code==401
