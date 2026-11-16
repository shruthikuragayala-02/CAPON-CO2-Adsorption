import json
from pathlib import Path
from fastapi import APIRouter,HTTPException,Depends
from fastapi.responses import FileResponse
import pandas as pd
from ..config import REPORT_DIR,PROJECT_DIR
from ..database import db
from ..security.auth import current_user
from ..services.prediction_service import runtime
router=APIRouter(tags=['analysis'])
def read_eval():
 p=REPORT_DIR/'evaluation.json'
 if not p.exists(): raise HTTPException(404,'Evaluation report is not available yet')
 return json.loads(p.read_text())
@router.get('/metrics')
def metrics(): return read_eval()['validation']
@router.get('/evaluation')
def evaluation(): return read_eval()
@router.get('/model_info')
def model_info():
 if not runtime.payload: return {'loaded':False,'error':runtime.error}
 p=runtime.payload;safe_meta=dict(p.get('metadata',{}));unc=dict(safe_meta.get('uncertainty',{}));unc.pop('sigma_model',None);safe_meta['uncertainty']=unc
 shap_meta=dict(safe_meta.get('shap',{}));shap_meta.pop('background',None);safe_meta['shap']=shap_meta
 return {'loaded':True,'version':p.get('version'),'features':p.get('features',[]),'metadata':safe_meta}
@router.get('/feature-importance')
def feature_importance():
 p=REPORT_DIR/'feature_importance.csv'
 if not p.exists(): raise HTTPException(404,'Feature importance is not available')
 return pd.read_csv(p).to_dict(orient='records')
@router.get('/shap/importance')
def shap_importance():
 p=REPORT_DIR/'shap_values_mean_abs.csv'
 if not p.exists(): raise HTTPException(404,'Global SHAP values are not available')
 return pd.read_csv(p).to_dict(orient='records')
@router.get('/hpo')
def hpo_report():
 report=read_eval()
 return {'summary':report.get('hpo_summary',{}),'parameter_importance':report.get('hpo_param_importance',{}),'calibration':report.get('calibration',{})}
@router.get('/dataset')
def dataset():
 p=PROJECT_DIR/'data/dataset_inspection.json'
 if not p.exists(): return {'error':'Dataset report not found'}
 meta=json.loads(p.read_text())
 return {k:v for k,v in meta.items() if k not in ('sha256_normalized_csv','repaired_source_line_numbers')}
@router.get('/reports/{name}')
def report_image(name:str):
 if name not in ('feature_importance.png','target_distribution.png','optimization_history.png','shap_summary_beeswarm.png','shap_bar.png'): raise HTTPException(404,'Report not found')
 p=REPORT_DIR/name
 if not p.exists(): raise HTTPException(404,'Report image not generated')
 return FileResponse(p)
@router.get('/explain/{prediction_id}')
def explain(prediction_id:str,user=Depends(current_user)):
 with db() as c: row=c.execute('SELECT result_json FROM predictions WHERE id=? AND user_id=?',(prediction_id,user['id'])).fetchone()
 if not row: raise HTTPException(404,'Prediction not found')
 return json.loads(row['result_json'])
