from fastapi import APIRouter,Depends,HTTPException,UploadFile,File,Query
from pydantic import BaseModel,Field
from pathlib import Path
import pandas as pd,io,hashlib,shutil,csv
from ..config import PROJECT_DIR,BASE_DIR,MODEL_PATH,DATABASE_URL
from ..database import db,audit
from ..security.auth import require_developer
router=APIRouter(prefix='/developer',tags=['developer'])

def parse_upload(raw_bytes,filename):
    if filename.lower().endswith('.csv'):
        text=raw_bytes.decode('cp1252',errors='replace')
        rows=[]
        for line_no,row in enumerate(csv.reader(io.StringIO(text)),start=1):
            if not row or not row[0].strip(): continue
            try: float(row[0].strip())
            except ValueError: continue
            while len(row)>41 and not row[-1].strip(): row.pop()
            if len(row)==43 and row[39]=='TGA' and row[40].startswith('('):
                row=row[:39]+[','.join(row[39:42]),row[42]]
            if len(row)>41: raise ValueError(f'Unexpected non-empty columns after Study ID near source line {line_no}')
            rows.append((row+['']*41)[:41])
        if not rows: raise ValueError('No numeric-entry source records found')
        return pd.DataFrame(rows)
    df=pd.read_excel(io.BytesIO(raw_bytes),sheet_name='Data' if filename.lower().endswith('.xlsx') else 0,header=None)
    df=df.iloc[:,:41]
    if df.shape[1]<41: raise ValueError(f'Expected at least 41 source columns, received {df.shape[1]}')
    return df[pd.to_numeric(df[0],errors='coerce').notna()].reset_index(drop=True)

@router.get('/overview')
def overview(user=Depends(require_developer)):
    from ..services.prediction_service import runtime
    info={}
    import json
    try: info=json.loads((BASE_DIR/'reports/evaluation.json').read_text()).get('dataset',{})
    except: pass
    with db() as c:
        n=c.execute('SELECT COUNT(*) AS user_count FROM users').fetchone()['user_count']
        jobs=[dict(x) for x in c.execute('SELECT id,status,progress,created_at FROM training_jobs ORDER BY created_at DESC LIMIT 5')]
    active_cfg=(runtime.payload.get('metadata',{}).get('training_config') if runtime.payload else None)
    algo=(runtime.payload.get('metadata',{}).get('algorithm') if runtime.payload else None)
    return {'dataset':info,'active_algorithm':algo,'active_config':active_cfg,'active_model':runtime.payload.get('version') if runtime.payload else None,'model_loaded':bool(runtime.payload),'users':n,'recent_jobs':jobs,'system':'healthy'}

@router.get('/dataset/missing')
def dataset_missing(user=Depends(require_developer)):
    """Missing-value profile of the engineered model features, to help choose an imputation strategy."""
    from ml.train import load_source
    from ml.features import build_features
    p=PROJECT_DIR/'data/mgo_database_source_normalized.csv'
    if not p.exists(): raise HTTPException(404,'Dataset file missing')
    try: raw,_,_=load_source(p);X=build_features(raw)
    except Exception as e: raise HTTPException(422,f'Could not profile dataset: {e}')
    n=len(X);miss=X.isna().sum().sort_values(ascending=False)
    items=[{'feature':k,'missing':int(v),'pct':round(100*float(v)/n,1)} for k,v in miss.items() if v>0]
    return {'rows':n,'features':int(X.shape[1]),'features_with_missing':len(items),'cells_missing_pct':round(100*float(X.isna().sum().sum())/(n*X.shape[1]),2),'items':items[:25]}

@router.get('/dataset/versions')
def dataset_versions(user=Depends(require_developer)):
    with db() as c: rows=c.execute('SELECT * FROM dataset_versions ORDER BY id DESC').fetchall()
    return {'versions':[dict(x) for x in rows]}

@router.post('/dataset/upload')
def dataset_upload(file:UploadFile=File(...),mode:str=Query('replace',pattern='^(replace|append)$'),user=Depends(require_developer)):
    name=file.filename or 'dataset.csv'
    try:
        b=file.file.read()
        if not name.lower().endswith(('.csv','.xlsx','.xls')): raise ValueError('Only CSV or Excel dataset files are supported')
        df=parse_upload(b,name)
        if df.empty: raise ValueError('No numeric Entry records found in column 0')
        target=pd.to_numeric(df[21].astype(str).str.replace('~','',regex=False).str.extract(r'([-+]?\d*\.?\d+)',expand=False),errors='coerce')
        study=pd.to_numeric(df[40],errors='coerce')
        if target.notna().sum()==0: raise ValueError('Target capacity at zero-based column 21 is missing')
        if study.notna().sum()==0: raise ValueError('Study ID at zero-based column 40 is missing')
        path=PROJECT_DIR/'data/mgo_database_source_normalized.csv'
        old=pd.read_csv(path,header=None,engine='python') if path.exists() else pd.DataFrame(columns=range(41))
        new=df.reset_index(drop=True)
        result=pd.concat([old,new],ignore_index=True) if mode=='append' else new
        result=result.iloc[:,:41]
        raw=result.to_csv(index=False,header=False).encode(); digest=hashlib.sha256(raw).hexdigest()
        version='dataset-'+digest[:12]
        version_path=PROJECT_DIR/'data/versions'/f'{version}.csv'; version_path.parent.mkdir(parents=True,exist_ok=True); version_path.write_bytes(raw)
        path.write_bytes(raw)
        with db() as c: c.execute('INSERT INTO dataset_versions(version,filename,sha256,row_count,created_by,notes) VALUES(?,?,?,?,?,?)',(version,name,digest,len(result),user['id'],mode))
        audit(user['id'],'dataset_upload',f'{version} mode={mode} rows={len(result)}')
        return {'version':version,'rows':len(result),'uploaded_records':len(new),'mode':mode,'sha256':digest}
    except Exception as e: raise HTTPException(422,f'Dataset upload rejected: {e}')

@router.get('/dataset/preview')
def dataset_preview(user=Depends(require_developer)):
    p=PROJECT_DIR/'data/mgo_database_source_normalized.csv'
    if not p.exists(): raise HTTPException(404,'Dataset file missing')
    d=pd.read_csv(p,header=None,engine='python').iloc[:,:41]
    return {'columns':[f'column_{i}' for i in range(41)],'rows':d.head(50).fillna('').values.tolist(),'count':len(d)}

@router.post('/dataset/rollback/{version}')
def dataset_rollback(version:str,user=Depends(require_developer)):
    src=PROJECT_DIR/'data/versions'/f'{version}.csv'
    if not src.exists(): raise HTTPException(404,'Dataset version not found')
    shutil.copy2(src,PROJECT_DIR/'data/mgo_database_source_normalized.csv'); audit(user['id'],'dataset_rollback',version); return {'restored':version}

@router.get('/users')
def users(user=Depends(require_developer)):
    with db() as c: return {'users':[dict(x) for x in c.execute('SELECT id,username,email,role,disabled,created_at FROM users ORDER BY id').fetchall()]}

@router.post('/users/{uid}/disable')
def disable_user(uid:int,disabled:bool=True,user=Depends(require_developer)):
    with db() as c: cur=c.execute("UPDATE users SET disabled=? WHERE id=? AND role='user'",(int(disabled),uid))
    if not cur.rowcount: raise HTTPException(404,'User not found or protected role')
    audit(user['id'],'user_status',f'{uid} disabled={disabled}'); return {'user_id':uid,'disabled':disabled}

@router.get('/audit')
def audit_logs(user=Depends(require_developer)):
    with db() as c: rows=c.execute('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 300').fetchall()
    return {'events':[dict(x) for x in rows]}

@router.get('/health')
def system_health(user=Depends(require_developer)):
    from ..services.prediction_service import runtime
    return {'api':'ok','database':'postgresql' if DATABASE_URL else 'sqlite','model_loaded':bool(runtime.payload),'model_error':runtime.error,'artifact_path':str(MODEL_PATH)}
class DeveloperPasswordChange(BaseModel):
    current_password:str
    new_password:str=Field(min_length=12,max_length=128)

@router.post('/change-password')
def change_developer_password(data:DeveloperPasswordChange,user=Depends(require_developer)):
    from .auth import active_dev_hash
    from ..security.auth import verify_password,hash_password
    current=active_dev_hash()
    if not current or not verify_password(data.current_password,current): raise HTTPException(400,'Current developer password is incorrect')
    with db() as c: c.execute("INSERT INTO app_settings(key,value) VALUES('developer_password_hash',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP",(hash_password(data.new_password),))
    audit(user['id'],'developer_password_change','developer password rotated')
    return {'ok':True,'message':'Developer password updated. Update DEVELOPER_PASSWORD in the environment as a recovery secret.'}
