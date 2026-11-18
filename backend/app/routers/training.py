from fastapi import APIRouter,Depends,HTTPException
from pydantic import BaseModel,Field,field_validator
from typing import Literal
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import uuid,json,shutil
from ..config import BASE_DIR,PROJECT_DIR,REPORT_DIR,MODEL_PATH
from ..database import db,audit
from ..security.auth import require_developer
from ml.options import available_models,IMPUTATION_STRATEGIES,DEFAULT_IMPUTATION
router=APIRouter(tags=['training']);pool=ThreadPoolExecutor(max_workers=1);locks={}
class TrainRequest(BaseModel):
    trials:int=Field(default=50,ge=1,le=200)
    timeout_seconds:int|None=Field(default=None,ge=1,le=3600)
    quick:bool=False
    seed:int=42
    alpha:float=Field(default=.1,gt=0,lt=.5)
    dataset_path:str|None=None
    # Backward-compatible API property used by prior clients.
    iterations:int|None=Field(default=None,ge=1,le=200)
    # Developer choices. models=None keeps the original behaviour (compare every available model).
    models:list[str]|None=Field(default=None,min_length=1,max_length=8)
    imputation:Literal['median','mean','most_frequent','constant','knn','iterative']=DEFAULT_IMPUTATION
    missing_indicator:bool=True
    @field_validator('models')
    @classmethod
    def known_models(cls,v):
        if v is None: return v
        info=available_models();bad=[m for m in v if m not in info or not info[m]['available']]
        if bad: raise ValueError(f"Model(s) not available: {', '.join(bad)}")
        return list(dict.fromkeys(v))

def worker(jobid,data_path,stage,req,actor):
    with db() as c:c.execute("UPDATE training_jobs SET status='running',progress=.05,log='Starting grouped Optuna HPO, SHAP and interval calibration' WHERE id=?",(jobid,))
    try:
        import sys;sys.path.insert(0,str(BASE_DIR))
        from ml.train import train
        result=train(Path(data_path),Path(stage),deploy=False,trials=req.trials,iterations=req.iterations,timeout_seconds=req.timeout_seconds,seed=req.seed,alpha=req.alpha,quick=req.quick,models=req.models,imputation=req.imputation,missing_indicator=req.missing_indicator)
        if locks.get(jobid,False):
            with db() as c:c.execute("UPDATE training_jobs SET status='cancelled',progress=0,log=log||'\\nCancelled after worker returned; active model unchanged' WHERE id=?",(jobid,))
            return
        version=result['model']['version'];artifact=str(Path(stage)/'saved_models'/f'{version}.joblib');model_name=result['model']['name']
        metrics=result['validation']['study_grouped_nested_5_fold'][model_name]['metrics']
        metrics.update(result.get('calibration',{}));cfg=result.get('training_config',{});metrics.update({'algorithm':model_name,'imputation':cfg.get('imputation'),'missing_indicator':cfg.get('missing_indicator'),'models_compared':cfg.get('models')})
        with db() as c:
            c.execute("""
    INSERT INTO model_versions
    (version, artifact_path, metrics_json, created_by, status)
    VALUES (?, ?, ?, ?, 'candidate')
    ON CONFLICT (version) DO UPDATE SET
        artifact_path = EXCLUDED.artifact_path,
        metrics_json = EXCLUDED.metrics_json,
        created_by = EXCLUDED.created_by,
        status = EXCLUDED.status
""", (version, artifact, json.dumps(metrics), actor))
            c.execute("UPDATE training_jobs SET status='completed',progress=1,log=log||'\\nCandidate ready for explicit deployment',result_json=? WHERE id=?",(json.dumps({'version':version,'report_path':str(Path(stage)/'reports/evaluation.json'),'hpo_summary':result.get('hpo_summary'),'calibration':result.get('calibration'),'config':result.get('training_config')}),jobid))
        audit(actor,'training_complete',version)
    except Exception as e:
        with db() as c:c.execute("UPDATE training_jobs SET status='failed',error=?,log=log||? WHERE id=?",(str(e),'\\n'+str(e),jobid))

@router.post('/train')
def start_training(req:TrainRequest,user=Depends(require_developer)):
    data=Path(req.dataset_path) if req.dataset_path else PROJECT_DIR/'data/mgo_database_source_normalized.csv'
    if not data.exists():raise HTTPException(404,'Training dataset not found')
    jobid=str(uuid.uuid4());stage=BASE_DIR/'saved_models'/'candidates'/jobid;stage.mkdir(parents=True,exist_ok=True)
    with db() as c:c.execute("INSERT INTO training_jobs(id,status,progress,log,created_by) VALUES(?,'queued',0,'Queued',?)",(jobid,user['id']))
    locks[jobid]=False;pool.submit(worker,jobid,str(data),str(stage),req,user['id']);effective_trials=10 if req.quick else (req.iterations or req.trials)
    audit(user['id'],'training_started',f"{jobid}; trials={effective_trials}; seed={req.seed}; models={','.join(req.models) if req.models else 'all'}; imputation={req.imputation}; indicator={req.missing_indicator}")
    return {'job_id':jobid,'status':'queued','trials':effective_trials,'models':req.models,'imputation':req.imputation}
@router.get('/train/options')
def training_options(user=Depends(require_developer)):
    """Choices the developer console offers: model families (with availability) and missing-value strategies."""
    return {'models':[{'id':k,**v} for k,v in available_models().items()],'imputation':[{'id':k,**v} for k,v in IMPUTATION_STRATEGIES.items()],
        'defaults':{'models':None,'imputation':DEFAULT_IMPUTATION,'missing_indicator':True,'trials':50,'seed':42,'alpha':.1}}
@router.get('/train/status')
def training_status(user=Depends(require_developer)):
    with db() as c:rows=c.execute('SELECT * FROM training_jobs ORDER BY created_at DESC LIMIT 30').fetchall()
    return {'jobs':[dict(r) for r in rows]}
@router.get('/train/history')
def training_history(user=Depends(require_developer)):
    with db() as c:return {'jobs':[dict(r) for r in c.execute('SELECT * FROM training_jobs ORDER BY created_at DESC LIMIT 100').fetchall()]}
def cancel_job(jobid,user):
    locks[jobid]=True
    with db() as c:
        r=c.execute('SELECT status FROM training_jobs WHERE id=?',(jobid,)).fetchone()
        if not r:raise HTTPException(404,'Training job not found')
        if r['status'] in ('queued','running'):c.execute("UPDATE training_jobs SET status='cancelling' WHERE id=?",(jobid,))
    return {'job_id':jobid,'status':'cancelling','note':'The current Optuna/model fit may finish before cancellation is applied; active model remains unchanged.'}
@router.post('/train/cancel/{jobid}')
def cancel(jobid:str,user=Depends(require_developer)):return cancel_job(jobid,user)
@router.post('/train/cancel')
def cancel_current(payload:dict,user=Depends(require_developer)):
    if not payload.get('job_id'):raise HTTPException(422,'job_id is required')
    return cancel_job(payload['job_id'],user)
@router.get('/developer/models')
def models(user=Depends(require_developer)):
    with db() as c:rows=c.execute('SELECT * FROM model_versions ORDER BY created_at DESC').fetchall()
    return {'models':[dict(r) for r in rows]}
class DeployRequest(BaseModel):version:str;confirm:bool=False
@router.post('/developer/deploy')
def deploy(req:DeployRequest,user=Depends(require_developer)):
    if not req.confirm:raise HTTPException(400,'Explicit confirmation is required')
    with db() as c:candidate=c.execute('SELECT * FROM model_versions WHERE version=?',(req.version,)).fetchone()
    if not candidate:raise HTTPException(404,'Candidate version not found')
    source=Path(candidate['artifact_path'])
    if not source.exists():raise HTTPException(404,'Candidate artifact missing')
    old=None
    try:
        import joblib
        old=joblib.load(MODEL_PATH).get('version') if MODEL_PATH.exists() else None
    except Exception:pass
    MODEL_PATH.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(source,MODEL_PATH)
    candidate_reports=source.parent.parent/'reports'
    if candidate_reports.exists():
        REPORT_DIR.mkdir(parents=True,exist_ok=True)
        for f in candidate_reports.iterdir():
            if f.is_file():shutil.copy2(f,REPORT_DIR/f.name)
    from ..services.prediction_service import reload_runtime
    reload_runtime()
    with db() as c:
        c.execute("UPDATE model_versions SET status='archived' WHERE status='deployed'")
        c.execute("UPDATE model_versions SET status='deployed' WHERE version=?",(req.version,))
        c.execute('INSERT INTO deployments(model_version,previous_version,actor_id,action) VALUES(?,?,?,?)',(req.version,old,user['id'],'deploy'))
    audit(user['id'],'model_deployed',req.version);return {'deployed':req.version,'previous':old}
@router.post('/developer/rollback/{version}')
def rollback(version:str,user=Depends(require_developer)):return deploy(DeployRequest(version=version,confirm=True),user)
