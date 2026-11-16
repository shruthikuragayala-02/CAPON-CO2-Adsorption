from __future__ import annotations
import json,uuid
import joblib,numpy as np,pandas as pd
from ..config import MODEL_PATH,REPORT_DIR
from ..database import db
from ml.features import build_features,raw_records_to_frame

class ModelRuntime:
    def __init__(self): self.payload=None; self.error=None; self.load()
    def load(self):
        try:
            if not MODEL_PATH.exists(): raise FileNotFoundError(f'No deployed model at {MODEL_PATH}. Train with python -m ml.train.')
            obj=joblib.load(MODEL_PATH)
            if not isinstance(obj,dict) or not all(k in obj for k in ('model','features','version','metadata')):
                raise ValueError("Saved model artifact must include 'model', 'features', 'version', and 'metadata'.")
            self.payload=obj;self.error=None
        except Exception as e:self.payload=None;self.error=str(e)
    def _shap_explanation(self,features,pred):
        """Exact tree SHAP contributions on the pipeline-imputed matrix."""
        meta=self.payload.get('metadata',{}).get('shap')
        if not meta or 'background' not in meta: return None
        import shap
        pipe=self.payload['model'];imp=pipe.named_steps.get('imputer');reg=pipe.named_steps.get('reg')
        matrix=np.asarray(imp.transform(features),dtype=float) if imp is not None else np.asarray(features,dtype=float)
        background=np.asarray(meta['background'],dtype=float)
        explainer=shap.TreeExplainer(reg,data=background,feature_perturbation='interventional',model_output='raw')
        vals=np.asarray(explainer.shap_values(matrix,check_additivity=True))
        if vals.ndim==3: vals=vals[:,:,0]
        vals=vals.reshape(-1)
        expected=float(np.asarray(explainer.expected_value).reshape(-1)[0])
        input_pred=float(pipe.predict(features)[0]);reconstructed=expected+float(vals.sum())
        correction=input_pred-reconstructed
        if abs(correction)>max(.1,.005*abs(input_pred)):
            raise RuntimeError(f'SHAP additivity check failed ({reconstructed:.6f} vs {input_pred:.6f} mg/g)')
        # TreeExplainer's float precision can leave a small residual. Assign only
        # that numerical residual to the largest contribution so the returned
        # complete decomposition adds exactly to the pipeline prediction.
        if len(vals): vals[int(np.argmax(np.abs(vals)))]+=correction
        reconstructed=expected+float(vals.sum())
        try: names=list(imp.get_feature_names_out(self.payload['features'])) if imp is not None else list(self.payload['features'])
        except Exception: names=list(meta.get('feature_names',self.payload['features']))
        original=matrix.reshape(-1)
        order=np.argsort(np.abs(vals))[::-1]
        contributions=[]
        for i in order:
            nm=str(names[i]) if i<len(names) else f'feature_{i}'
            readable=nm.replace('missingindicator_','')+' (missingness indicator)' if nm.startswith('missingindicator_') else nm
            contributions.append({'feature':readable,'value':float(original[i]),'shap_mg_g':float(vals[i])})
        return {'type':'SHAP TreeExplainer','base_value_mg_g':expected,'contributions':contributions,'sum_check':reconstructed,'additivity_adjustment_mg_g':correction}
    def _model_std(self,features):
        pipe=self.payload['model'];reg=pipe.named_steps.get('reg');imp=pipe.named_steps.get('imputer')
        if reg is None or reg.__class__.__name__ not in ('RandomForestRegressor','ExtraTreesRegressor') or not hasattr(reg,'estimators_'): return None
        matrix=imp.transform(features) if imp is not None else features.to_numpy()
        preds=np.column_stack([tree.predict(matrix) for tree in reg.estimators_])
        return float(np.std(preds[0],ddof=1))
    def predict(self,records,persist_user=None,explain=True):
        if not self.payload: raise RuntimeError(self.error or 'Model is not loaded')
        raw=raw_records_to_frame(records);features=build_features(raw,drop_constant=False)
        columns=self.payload['features'];features=features.reindex(columns=columns,fill_value=0)
        pred=float(self.payload['model'].predict(features)[0]);meta=self.payload.get('metadata',{});ranges=meta.get('training_feature_ranges',{})
        ood=[]
        for col in columns:
            val=features.iloc[0].get(col);bounds=ranges.get(col,{})
            if pd.notna(val) and bounds.get('min') is not None and (float(val)<bounds['min'] or float(val)>bounds['max']):
                ood.append({'feature':col,'value':float(val),'observed_min':bounds['min'],'observed_max':bounds['max']})
        calibration=meta.get('uncertainty');uncertainty=None;uncertainty_message=None;model_std=self._model_std(features)
        if calibration and calibration.get('sigma_model') is not None and calibration.get('conformal_quantile') is not None:
            try:
                sigma=max(float(calibration['sigma_model'].predict(features)[0]),1e-6)
                widening=1+0.25*len(ood)
                std=sigma*widening;q=float(calibration['conformal_quantile']);half=q*std
                lo,hi=pred-half,pred+half;relative=100*(hi-lo)/max(abs(pred),1e-6)
                level=float(calibration.get('target_coverage',.90))
                flag='high' if relative<=50 else ('medium' if relative<=100 else 'low')
                if ood: flag={'high':'medium','medium':'low','low':'low'}[flag]
                uncertainty={'sigma_mg_g':std,'sigma_mmol_g':std/44.01,'std_mg_g':std,'std_mmol_g':std/44.01,'lower_mg_g':lo,'upper_mg_g':hi,
                    'lower_mmol_g':lo/44.01,'upper_mmol_g':hi/44.01,'confidence_level':level,
                    'method':calibration.get('method','Grouped normalized conformal interval'),'relative_width_pct':relative}
            except Exception as e: uncertainty_message=f'Calibration could not be applied: {e}'
        else: uncertainty_message='This saved model has no calibration artifact. Retrain the model to enable prediction intervals.'
        if uncertainty is None:flag='low';half=None;prediction_range=None
        else:half=(uncertainty['upper_mg_g']-uncertainty['lower_mg_g'])/2;prediction_range=[uncertainty['lower_mg_g'],uncertainty['upper_mg_g']]
        local=None;shap_error=None
        if explain:
            try: local=self._shap_explanation(features,pred)
            except Exception as e: shap_error=f'SHAP explanation unavailable: {e}'
        result={'prediction_id':str(uuid.uuid4()),'capacity_mg_g':pred,'capacity_mmol_g':pred/44.01,
            'uncertainty':uncertainty,'confidence_flag':flag,'uncertainty_message':uncertainty_message,
            'uncertainty_estimate_mg_g':half,'uncertainty_estimate_mmol_g':None if half is None else half/44.01,
            'prediction_range_mg_g':prediction_range,'uncertainty_label':None if uncertainty is None else uncertainty['method'],
            'model_std_mg_g':model_std,'ood_warning':bool(ood),'ood_features':ood,
            'local_explanation':local,'explanation_error':shap_error,'model_version':self.payload.get('version','unknown')}
        if persist_user:
            with db() as c:c.execute('INSERT INTO predictions(id,user_id,input_json,result_json) VALUES(?,?,?,?)',(result['prediction_id'],persist_user,json.dumps(records[0],default=str),json.dumps(result,default=float)))
        return result

runtime=ModelRuntime()
def reload_runtime():runtime.load();return runtime
