from fastapi import APIRouter,Depends,HTTPException,UploadFile,File
from typing import Any
import io
import pandas as pd
from ..schemas import PredictionInput
from ..security.auth import require_user
from ..services.prediction_service import runtime
router=APIRouter(tags=['prediction'])

@router.post('/predict')
def predict(data:PredictionInput,user=Depends(require_user)):
    try: return runtime.predict([data.model_dump(exclude_none=True)],persist_user=user['id'])
    except Exception as e: raise HTTPException(503,f'Prediction unavailable: {e}')

@router.post('/predict_batch/json')
def predict_json(data:list[dict[str,Any]],user=Depends(require_user)):
    if not data or len(data)>500: raise HTTPException(400,'Submit between 1 and 500 records')
    try:
        results=[runtime.predict([r],persist_user=user['id'],explain=False) for r in data]
        return {'count':len(results),'results':results}
    except Exception as e: raise HTTPException(422,f'Batch validation/prediction failed: {e}')

@router.post('/predict_batch')
def predict_batch(file:UploadFile=File(...),user=Depends(require_user)):
    if not file.filename.lower().endswith(('.csv','.xlsx','.xls')): raise HTTPException(400,'Upload a CSV or Excel file')
    try:
        b=file.file.read(); df=pd.read_csv(io.BytesIO(b)) if file.filename.lower().endswith('.csv') else pd.read_excel(io.BytesIO(b))
        if len(df)>500: raise ValueError('Maximum batch size is 500 rows')
        results=[runtime.predict([r.dropna().to_dict()],persist_user=user['id'],explain=False) for _,r in df.iterrows()]
        out=df.copy(); out['predicted_capacity_mg_g']=[x['capacity_mg_g'] for x in results]; out['predicted_capacity_mmol_g']=[x['capacity_mmol_g'] for x in results]; out['prediction_lower_mg_g']=[None if x['uncertainty'] is None else x['uncertainty']['lower_mg_g'] for x in results]; out['prediction_upper_mg_g']=[None if x['uncertainty'] is None else x['uncertainty']['upper_mg_g'] for x in results]; out['confidence_flag']=[x['confidence_flag'] for x in results]; out['ood_warning']=[x['ood_warning'] for x in results]
        return {'count':len(out),'results':results,'result_csv':out.to_csv(index=False)}
    except Exception as e: raise HTTPException(422,f'Could not process batch: {e}')
