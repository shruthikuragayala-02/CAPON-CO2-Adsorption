"""Nested study-grouped Optuna training, SHAP and normalized conformal calibration.
Capacity remains mg/g throughout; only RMSE-derived mmol/g values are converted.
"""
from __future__ import annotations
import argparse, hashlib, json, re, time, warnings
from datetime import datetime, timezone
from pathlib import Path
import joblib
import numpy as np
import pandas as pd
import optuna
from optuna.samplers import TPESampler
from optuna.pruners import MedianPruner
from sklearn.base import clone
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.ensemble import (RandomForestRegressor, ExtraTreesRegressor,
    GradientBoostingRegressor, HistGradientBoostingRegressor)
from sklearn.model_selection import GroupKFold, KFold, cross_val_predict
from sklearn.metrics import r2_score, mean_absolute_error, mean_squared_error

try:
    from .features import build_features
    from .options import build_imputer, validate_imputation, DEFAULT_IMPUTATION
except ImportError:
    from features import build_features
    from options import build_imputer, validate_imputation, DEFAULT_IMPUTATION

warnings.filterwarnings('ignore', category=UserWarning, module='optuna')

def parse_num(v):
    if pd.isna(v): return np.nan
    m=re.search(r"[-+]?\d*\.?\d+",str(v).replace('~',''))
    return float(m.group()) if m else np.nan

def load_source(path:Path):
    """Keep the existing 41-column source loader contract (header=None, cols 21/40)."""
    if path.suffix.lower()=='.csv': raw=pd.read_csv(path,header=None,encoding='utf-8',engine='python',on_bad_lines='skip')
    else: raw=pd.read_excel(path,sheet_name='Data',header=None)
    if raw.shape[1] < 41: raise ValueError(f'Expected >=41 source columns; found {raw.shape[1]}')
    raw=raw.iloc[:,:41].copy()
    raw=raw[pd.to_numeric(raw[0],errors='coerce').notna()].reset_index(drop=True)
    capacity=raw[21].map(parse_num); study=raw[40].map(parse_num)
    valid=capacity.notna() & study.notna()
    return raw.loc[valid].reset_index(drop=True),capacity[valid].reset_index(drop=True),study[valid].astype(int).reset_index(drop=True)

def _suggest_params(name,trial):
    if name in ('RandomForest','ExtraTrees'):
        depth=None if trial.suggest_categorical('unlimited_depth',[True,False]) else trial.suggest_int('max_depth',3,40)
        return {'n_estimators':trial.suggest_int('n_estimators',100,800),'max_depth':depth,
            'min_samples_split':trial.suggest_int('min_samples_split',2,20),
            'min_samples_leaf':trial.suggest_int('min_samples_leaf',1,10),
            'max_features':trial.suggest_float('max_features',0.3,1.0)}
    if name=='GradientBoosting':
        return {'n_estimators':trial.suggest_int('n_estimators',100,800),
            'learning_rate':trial.suggest_float('learning_rate',0.005,0.3,log=True),
            'max_depth':trial.suggest_int('max_depth',2,6),
            'subsample':trial.suggest_float('subsample',0.5,1.0),
            'min_samples_leaf':trial.suggest_int('min_samples_leaf',1,10)}
    if name=='HistGradientBoosting':
        return {'max_iter':trial.suggest_int('max_iter',100,800),
            'learning_rate':trial.suggest_float('learning_rate',0.005,0.3,log=True),
            'max_leaf_nodes':trial.suggest_int('max_leaf_nodes',5,63),
            'l2_regularization':trial.suggest_float('l2_regularization',1e-3,10,log=True),
            'min_samples_leaf':trial.suggest_int('min_samples_leaf',5,40)}
    if name=='XGBoost':
        return {'n_estimators':trial.suggest_int('n_estimators',100,800),'max_depth':trial.suggest_int('max_depth',2,10),
            'learning_rate':trial.suggest_float('learning_rate',.005,.3,log=True),'subsample':trial.suggest_float('subsample',.5,1),
            'colsample_bytree':trial.suggest_float('colsample_bytree',.3,1),'reg_lambda':trial.suggest_float('reg_lambda',1e-3,20,log=True)}
    if name=='LightGBM':
        return {'n_estimators':trial.suggest_int('n_estimators',100,800),'num_leaves':trial.suggest_int('num_leaves',7,63),
            'learning_rate':trial.suggest_float('learning_rate',.005,.3,log=True),'max_depth':trial.suggest_int('max_depth',-1,16),
            'subsample':trial.suggest_float('subsample',.5,1),'colsample_bytree':trial.suggest_float('colsample_bytree',.3,1),
            'reg_lambda':trial.suggest_float('reg_lambda',1e-3,20,log=True)}
    if name=='CatBoost':
        return {'iterations':trial.suggest_int('iterations',100,800),'depth':trial.suggest_int('depth',3,10),
            'learning_rate':trial.suggest_float('learning_rate',.005,.3,log=True),'l2_leaf_reg':trial.suggest_float('l2_leaf_reg',1e-3,20,log=True)}
    raise KeyError(name)

def _build_estimator(name,params,seed):
    if name=='RandomForest': return RandomForestRegressor(random_state=seed,n_jobs=1,**params)
    if name=='ExtraTrees': return ExtraTreesRegressor(random_state=seed,n_jobs=1,**params)
    if name=='GradientBoosting': return GradientBoostingRegressor(random_state=seed,**params)
    if name=='HistGradientBoosting': return HistGradientBoostingRegressor(random_state=seed,**params)
    if name=='XGBoost':
        from xgboost import XGBRegressor
        return XGBRegressor(objective='reg:squarederror',random_state=seed,n_jobs=1,verbosity=0,**params)
    if name=='LightGBM':
        from lightgbm import LGBMRegressor
        return LGBMRegressor(random_state=seed,n_jobs=1,verbosity=-1,**params)
    if name=='CatBoost':
        from catboost import CatBoostRegressor
        return CatBoostRegressor(random_seed=seed,verbose=False,allow_writing_files=False,**params)
    raise KeyError(name)

def model_specs(selected=None):
    """Candidates; optional libraries are added only when importable.
    `selected` (developer choice) restricts training to those models, in the given order."""
    specs={'RandomForest':True,'ExtraTrees':True,'GradientBoosting':True}
    for module,name in [('xgboost','XGBoost'),('lightgbm','LightGBM'),('catboost','CatBoost')]:
        try: __import__(module); specs[name]=True
        except Exception: pass
    if selected:
        unknown=[m for m in selected if m not in specs]
        if unknown: raise ValueError(f"Model(s) not available in this installation: {', '.join(unknown)}. Available: {', '.join(specs)}")
        specs={m:True for m in dict.fromkeys(selected)}
    return specs

# Developer-chosen missing-value handling; set per training run (train() is single-run per worker thread).
IMPUTE_CONFIG={'strategy':DEFAULT_IMPUTATION,'indicator':True}

def make_pipe(name,params,seed):
    return Pipeline([('imputer',build_imputer(IMPUTE_CONFIG['strategy'],IMPUTE_CONFIG['indicator'],seed)),('reg',_build_estimator(name,params,seed))])

def metric_row(y,p):
    mse=float(mean_squared_error(y,p)); rmse=mse**.5
    return {'r2':float(r2_score(y,p)),'mae_mg_g':float(mean_absolute_error(y,p)),
        'mse_mg_g_squared':mse,'rmse_mg_g':rmse,'rmse_mmol_g':rmse/44.01}

def _conformal_quantile(scores,alpha):
    scores=np.asarray(scores,float); scores=scores[np.isfinite(scores)]
    if not len(scores): return None
    rank=min(len(scores),int(np.ceil((len(scores)+1)*(1-alpha))))
    return float(np.sort(scores)[rank-1])

def _new_sigma(seed):
    return RandomForestRegressor(n_estimators=120,min_samples_leaf=5,max_features=.8,random_state=seed,n_jobs=1)

def _crossfit_sigma(X,residuals,groups,seed,n_splits=3):
    """Study-held-out scale predictions for normalized conformal scores."""
    absres=np.abs(np.asarray(residuals,float)); pred=np.full(len(absres),np.nan)
    cv=GroupKFold(n_splits=min(n_splits,pd.Series(groups).nunique()))
    for f,(tr,te) in enumerate(cv.split(X,absres,groups)):
        sigma=_new_sigma(seed+f).fit(X.iloc[tr],absres[tr])
        pred[te]=np.maximum(sigma.predict(X.iloc[te]),1e-6)
    return pred

def _tree_std(fitted,X):
    reg=fitted.named_steps['reg']; imp=fitted.named_steps['imputer']
    if not hasattr(reg,'estimators_') or reg.__class__.__name__ not in ('RandomForestRegressor','ExtraTreesRegressor'): return None
    matrix=imp.transform(X)
    trees=np.asarray(reg.estimators_,dtype=object).ravel()
    if not len(trees): return None
    p=np.column_stack([t.predict(matrix) for t in trees])
    return np.std(p,axis=1,ddof=1).astype(float)

def _study(name,X,y,groups,n_trials,seed,timeout_seconds,history,study_key):
    cv=GroupKFold(n_splits=min(3,pd.Series(groups).nunique()))
    folds=list(cv.split(X,y,groups))
    def objective(trial):
        params=_suggest_params(name,trial); fold_rmse=[]
        for step,(tr,te) in enumerate(folds):
            model=make_pipe(name,params,seed+step)
            model.fit(X.iloc[tr],y.iloc[tr])
            value=float(mean_squared_error(y.iloc[te],model.predict(X.iloc[te]))**.5)
            fold_rmse.append(value); trial.report(float(np.mean(fold_rmse)),step)
            if trial.should_prune(): raise optuna.TrialPruned()
        return float(np.mean(fold_rmse))
    study=optuna.create_study(direction='minimize',sampler=TPESampler(seed=seed),pruner=MedianPruner(n_startup_trials=min(5,n_trials),n_warmup_steps=1))
    study.optimize(objective,n_trials=n_trials,timeout=timeout_seconds,gc_after_trial=True,show_progress_bar=False)
    for t in study.trials:
        history.append({'study':study_key,'model':name,'trial':t.number,'state':t.state.name,'value_rmse_mg_g':t.value,'params_json':json.dumps(t.params,sort_keys=True),'seed':seed})
    if study.best_trial is None: raise RuntimeError(f'Optuna produced no completed trial for {study_key}')
    return study

def _param_importance(study):
    try: return {str(k):float(v) for k,v in optuna.importance.get_param_importances(study).items()}
    except Exception: return {}

def _calibrate_outer_fold(name,params,Xtr,ytr,gtr,Xte,seed,alpha):
    """Inner-group OOF residuals calibrate a scale model; outer studies assess coverage."""
    inner=GroupKFold(n_splits=min(3,pd.Series(gtr).nunique())); oof=np.full(len(ytr),np.nan)
    for f,(a,b) in enumerate(inner.split(Xtr,ytr,gtr)):
        m=make_pipe(name,params,seed+f);m.fit(Xtr.iloc[a],ytr.iloc[a]);oof[b]=m.predict(Xtr.iloc[b])
    residuals=np.asarray(ytr,float)-oof
    sigma_oof=_crossfit_sigma(Xtr,residuals,gtr,seed+100,n_splits=3)
    q=_conformal_quantile(np.abs(residuals)/np.maximum(sigma_oof,1e-6),alpha)
    sigma=_new_sigma(seed+200).fit(Xtr,np.abs(residuals))
    fitted=make_pipe(name,params,seed+300).fit(Xtr,ytr)
    point=fitted.predict(Xte);scale=np.maximum(sigma.predict(Xte),1e-6)
    half=q*scale
    return fitted,sigma,q,point,scale,point-half,point+half,_tree_std(fitted,Xte)

def _shap_artifacts(fitted,X,features,reports,seed):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    import shap
    imp=fitted.named_steps['imputer']; reg=fitted.named_steps['reg']
    matrix=np.asarray(imp.transform(X),dtype=float)
    try: names=list(imp.get_feature_names_out(features))
    except Exception: names=list(features)+[f'missing_indicator_{i}' for i in range(matrix.shape[1]-len(features))]
    rng=np.random.default_rng(seed); take=np.arange(len(matrix))
    if len(take)>250: take=np.sort(rng.choice(take,250,replace=False))
    sample=matrix[take]
    background=matrix[np.sort(rng.choice(np.arange(len(matrix)),min(80,len(matrix)),replace=False))]
    explainer=shap.TreeExplainer(reg,data=background,feature_perturbation='interventional',model_output='raw')
    sv=explainer.shap_values(sample,check_additivity=True)
    sv=np.asarray(sv)
    if sv.ndim==3: sv=sv[:,:,0]
    expected=np.asarray(explainer.expected_value).reshape(-1)
    expected=float(expected[0])
    reports.mkdir(parents=True,exist_ok=True)
    plt.figure(figsize=(9,7));shap.summary_plot(sv,sample,feature_names=names,show=False,max_display=20);plt.tight_layout();plt.savefig(reports/'shap_summary_beeswarm.png',dpi=150,bbox_inches='tight');plt.close()
    plt.figure(figsize=(8,6));shap.summary_plot(sv,sample,feature_names=names,plot_type='bar',show=False,max_display=20);plt.tight_layout();plt.savefig(reports/'shap_bar.png',dpi=150,bbox_inches='tight');plt.close()
    importance=np.mean(np.abs(sv),axis=0)
    imp_df=pd.DataFrame({'feature':names,'mean_abs_shap_mg_g':importance}).sort_values('mean_abs_shap_mg_g',ascending=False)
    imp_df.to_csv(reports/'shap_values_mean_abs.csv',index=False)
    for feature in imp_df.feature.head(5):
        try:
            plt.figure(figsize=(7,5));shap.dependence_plot(feature,sv,sample,feature_names=names,interaction_index=None,show=False);plt.tight_layout()
            slug=re.sub(r'[^a-zA-Z0-9_-]+','_',feature)[:60];plt.savefig(reports/f'shap_dependence_{slug}.png',dpi=140,bbox_inches='tight');plt.close()
        except Exception as e: warnings.warn(f'SHAP dependence plot failed for {feature}: {e}')
    return {'expected_value':expected,'background':background.tolist(),'feature_names':names,'mean_abs_importance':imp_df.to_dict(orient='records')},imp_df

def train(data_path:Path,out_dir:Path,iterations=None,deploy=True,trials=50,timeout_seconds=None,seed=42,alpha=.10,quick=False,models=None,imputation=DEFAULT_IMPUTATION,missing_indicator=True):
    """Train nested grouped HPO. `iterations` remains as a backward-compatible trials alias."""
    if iterations is not None: trials=int(iterations)
    if quick: trials=10
    if trials<1: raise ValueError('trials must be >= 1')
    if not 0<alpha<.5: raise ValueError('alpha must be between 0 and 0.5')
    validate_imputation(imputation);IMPUTE_CONFIG.update(strategy=imputation,indicator=bool(missing_indicator))
    out_dir=Path(out_dir);data_path=Path(data_path)
    out_dir.mkdir(parents=True,exist_ok=True);models_dir=out_dir/'saved_models';reports_dir=out_dir/'reports';models_dir.mkdir(exist_ok=True);reports_dir.mkdir(exist_ok=True)
    raw,y,groups=load_source(data_path);X=build_features(raw)
    if X.isna().all().any(): X=X.drop(columns=X.columns[X.isna().all()])
    if groups.nunique()<5: raise ValueError('At least five distinct Study IDs are required for 5-fold grouped evaluation')
    specs=model_specs(models);history=[];nested={};random_results={};outer_predictions={};outer_intervals={};outer_scores={};importance_records={};t0=time.time()
    outer=GroupKFold(5);outer_splits=list(outer.split(X,y,groups))
    optuna.logging.set_verbosity(optuna.logging.WARNING)
    for model_index,name in enumerate(specs):
        pred=np.full(len(y),np.nan);low=np.full(len(y),np.nan);high=np.full(len(y),np.nan);oof_scores=np.full(len(y),np.nan);fold_metrics=[];fold_best={}
        for fold,(tr,te) in enumerate(outer_splits,1):
            key=f'outer-{fold}'
            study=_study(name,X.iloc[tr],y.iloc[tr],groups.iloc[tr],trials,seed+model_index*1000+fold,timeout_seconds,history,key)
            params=study.best_params.copy()
            if name in ('RandomForest','ExtraTrees') and params.pop('unlimited_depth',False): params['max_depth']=None
            else: params.pop('unlimited_depth',None)
            fold_best[str(fold)]=params
            importance_records[f'{name}/outer-{fold}']=_param_importance(study)
            fitted,sigma,q,p,scale,lo,hi,tree_std=_calibrate_outer_fold(name,params,X.iloc[tr],y.iloc[tr],groups.iloc[tr],X.iloc[te],seed+model_index*10000+fold,alpha)
            pred[te]=p;low[te]=lo;high[te]=hi;oof_scores[te]=np.abs(y.iloc[te].to_numpy()-p)/np.maximum(scale,1e-6)
            fm=metric_row(y.iloc[te],p);fm.update({'fold':fold,'n_test':len(te),'test_studies':sorted(groups.iloc[te].unique().astype(int).tolist()),'interval_coverage':float(np.mean((y.iloc[te].to_numpy()>=lo)&(y.iloc[te].to_numpy()<=hi))),'mean_interval_width_mg_g':float(np.mean(hi-lo)),'conformal_quantile':q})
            fold_metrics.append(fm)
        nested[name]={'validation':'Nested Study-GroupKFold 5 outer / Optuna grouped 3 inner','metrics':metric_row(y,pred),'fold_metrics':fold_metrics,'best_params_by_outer_fold':fold_best,
            'interval':{'target_coverage':1-alpha,'empirical_coverage':float(np.mean((y.to_numpy()>=low)&(y.to_numpy()<=high))),'mean_interval_width_mg_g':float(np.mean(high-low)),'mean_interval_width_mmol_g':float(np.mean(high-low))/44.01}}
        outer_predictions[name]=pred;outer_intervals[name]=(low,high);outer_scores[name]=oof_scores
        # Conventional random 5-fold baseline stays independent and clearly labelled.
        defaults={'RandomForest':{'n_estimators':300,'max_depth':None,'min_samples_split':2,'min_samples_leaf':2,'max_features':.8},
            'ExtraTrees':{'n_estimators':300,'max_depth':None,'min_samples_split':2,'min_samples_leaf':2,'max_features':.8},
            'GradientBoosting':{'n_estimators':200,'learning_rate':.05,'max_depth':3,'subsample':.8,'min_samples_leaf':2},
            'HistGradientBoosting':{'max_iter':200,'learning_rate':.05,'max_leaf_nodes':15,'l2_regularization':1.,'min_samples_leaf':15}}
        if name in defaults:
            base=make_pipe(name,defaults[name],seed)
            rp=cross_val_predict(base,X,y,cv=KFold(5,shuffle=True,random_state=seed),n_jobs=1)
            random_results[name]={'validation':'Random 5-fold baseline settings','metrics':metric_row(y,rp)}
        gm=nested[name]['metrics'];print(f'{name}: grouped nested R2={gm["r2"]:.3f}, MAE={gm["mae_mg_g"]:.1f} mg/g, RMSE={gm["rmse_mmol_g"]:.3f} mmol/g; grouped interval coverage={nested[name]["interval"]["empirical_coverage"]:.3f}')
    # SHAP TreeExplainer constrains deploy selection to supported tree ensembles.
    deployable=[n for n in specs if n in ('RandomForest','ExtraTrees','GradientBoosting','XGBoost','LightGBM','CatBoost')]
    if not deployable: raise ValueError('No deployable model was selected')
    training_config={'models':list(specs),'imputation':imputation,'missing_indicator':bool(missing_indicator),'trials_per_study':trials,'seed':seed,'alpha':float(alpha),'developer_selected_models':bool(models)}
    winner=min(deployable,key=lambda k:nested[k]['metrics']['rmse_mg_g'])
    final_study=_study(winner,X,y,groups,trials,seed+99999,timeout_seconds,history,'final-full-data')
    final_params=final_study.best_params.copy()
    if winner in ('RandomForest','ExtraTrees') and final_params.pop('unlimited_depth',False): final_params['max_depth']=None
    else: final_params.pop('unlimited_depth',None)
    importance_records[f'{winner}/final-full-data']=_param_importance(final_study)
    deployed=make_pipe(winner,final_params,seed).fit(X,y)
    # Final conformal artefact calibrated from nested grouped OOF residuals.
    residuals=np.asarray(y,float)-outer_predictions[winner]
    # Pool normalized scores only from genuinely outer-held-out study groups.
    # The scale model for each score was fitted exclusively within that outer fold's training groups.
    normalized=np.asarray(outer_scores[winner],float)
    conformal_q=_conformal_quantile(normalized,alpha)
    sigma_model=_new_sigma(seed+654321).fit(X,np.abs(residuals))
    # Held-out interval metrics are outer-fold calibrated values, not the in-sample final conformal quantile.
    fold_low,fold_high=outer_intervals[winner]
    calibration={'alpha':float(alpha),'target_coverage':float(1-alpha),'empirical_coverage':float(np.mean((np.asarray(y)>=fold_low)&(np.asarray(y)<=fold_high))),
        'mean_interval_width_mg_g':float(np.mean(fold_high-fold_low)),'mean_interval_width_mmol_g':float(np.mean(fold_high-fold_low))/44.01,
        'conformal_quantile':conformal_q,'method':'Study-grouped normalized split-conformal calibration on nested out-of-fold absolute residuals; fold-specific cross-fitted scale models for reported outer-fold coverage',
        'coverage_note':'Empirical coverage is pooled outer-fold held-out coverage; small number of studies makes it noisy.'}
    shap_meta,shap_df=_shap_artifacts(deployed,X,list(X.columns),reports_dir,seed)
    # Per-feature ranges and payload metadata remain serializable except the estimator artefacts intentionally stored in joblib.
    ranges={c:{'min':float(X[c].min()) if X[c].notna().any() else None,'max':float(X[c].max()) if X[c].notna().any() else None} for c in X.columns}
    stamp=datetime.now(timezone.utc).isoformat();digest=hashlib.sha256(data_path.read_bytes()).hexdigest();version='mgo-'+datetime.now().strftime('%Y%m%d-%H%M%S')
    import sklearn
    meta={'trained_at_utc':stamp,'algorithm':winner,'training_config':training_config,'best_params':final_params,'dataset_sha256':digest,'n_samples':len(X),'n_studies':int(groups.nunique()),'seed':seed,'sklearn_version':sklearn.__version__,'training_feature_ranges':ranges,
        'uncertainty':{'alpha':float(alpha),'target_coverage':float(1-alpha),'conformal_quantile':conformal_q,'sigma_model':sigma_model,'method':calibration['method'],'empirical_coverage':calibration['empirical_coverage'],'mean_interval_width_mg_g':calibration['mean_interval_width_mg_g']},
        'shap':shap_meta}
    payload={'model':deployed,'features':list(X.columns),'version':version,'metadata':meta}
    joblib.dump(payload,models_dir/f'{version}.joblib')
    if deploy: joblib.dump(payload,models_dir/'active_model.joblib')
    hpo_summary={'trials_per_study':trials,'timeout_seconds_per_study':timeout_seconds,'seed':seed,'sampler':'Optuna TPESampler','pruner':'MedianPruner','objective':'mean inner GroupKFold RMSE in mg/g','models':{n:{'outer_fold_best_params':v['best_params_by_outer_fold'],'nested_grouped_metrics':v['metrics'],'interval':v['interval']} for n,v in nested.items()},'selected_final_params':final_params,'final_study_best_inner_rmse_mg_g':float(final_study.best_value)}
    report={'training_config':training_config,'dataset':{'n_samples':len(X),'n_features':X.shape[1],'n_studies':int(groups.nunique()),'target_unit':'mg/g','sha256':digest,'study_counts':{str(int(k)):int(v) for k,v in groups.value_counts().sort_index().items()}},
        'model':{'name':winner,'version':version,'best_params':final_params,'trained_at_utc':stamp,'feature_names':list(X.columns),'training_feature_ranges':ranges,'missing_values_by_feature':X.isna().sum().to_dict()},
        'validation':{'random_5_fold':random_results,'study_grouped_nested_5_fold':nested,'selection_rule':('developer-selected model' if len(deployable)==1 and models else 'minimum nested grouped RMSE among the selected TreeExplainer-supported models'),'selection_caveat':'Multiple-model selection can add optimism; grouped CV is not a prospective guarantee.'},
        'hpo_summary':hpo_summary,'hpo_param_importance':importance_records,'calibration':calibration,'shap':{'method':'TreeExplainer','n_features':len(shap_meta['feature_names']),'global_importance_path':'shap_values_mean_abs.csv'},'runtime_seconds':round(time.time()-t0,1)}
    (reports_dir/'evaluation.json').write_text(json.dumps(report,indent=2,default=lambda o: float(o) if hasattr(o,'item') else str(o)))
    pd.DataFrame([{'validation':'Study-grouped nested','model':k,**v['metrics'],'target_coverage':v['interval']['target_coverage'],'empirical_coverage':v['interval']['empirical_coverage'],'mean_interval_width_mg_g':v['interval']['mean_interval_width_mg_g']} for k,v in nested.items()]+[{'validation':'Random 5-fold baseline','model':k,**v['metrics']} for k,v in random_results.items()]).to_csv(reports_dir/'model_comparison.csv',index=False)
    pd.DataFrame(history).to_csv(reports_dir/'hpo_history.csv',index=False)
    (reports_dir/'hpo_param_importance.json').write_text(json.dumps(importance_records,indent=2))
    # HPO objective histories and grouped validation figures.
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    hist_df=pd.DataFrame(history);plt.figure(figsize=(9,5))
    if not hist_df.empty:
        for nm,gdf in hist_df[hist_df.state=='COMPLETE'].groupby('model'):
            vals=pd.to_numeric(gdf.value_rmse_mg_g,errors='coerce');plt.plot(np.arange(len(vals)),vals,label=nm,alpha=.8)
        plt.xlabel('Completed trial (per study sequence)');plt.ylabel('Inner grouped RMSE (mg/g)');plt.legend(fontsize=7,ncol=2)
    plt.tight_layout();plt.savefig(reports_dir/'optimization_history.png',dpi=150);plt.close()
    # Secondary permutation importance (training-set descriptive only).
    from sklearn.inspection import permutation_importance
    pi=permutation_importance(deployed,X,y,n_repeats=8,random_state=seed,scoring='r2',n_jobs=1)
    pd.DataFrame({'feature':X.columns,'importance_mean_drop_r2':pi.importances_mean,'importance_std':pi.importances_std}).sort_values('importance_mean_drop_r2',ascending=False).to_csv(reports_dir/'feature_importance.csv',index=False)
    fi=pd.read_csv(reports_dir/'feature_importance.csv').head(16).sort_values('importance_mean_drop_r2')
    plt.figure(figsize=(8,6));plt.barh(fi.feature,fi.importance_mean_drop_r2,color='#258b82');plt.xlabel('Permutation importance (training; descriptive)');plt.tight_layout();plt.savefig(reports_dir/'feature_importance.png',dpi=150);plt.close()
    plt.figure(figsize=(8,4));plt.hist(y,bins=20,color='#258b82',alpha=.85);plt.xlabel('CO₂ capacity (mg/g)');plt.ylabel('Observations');plt.tight_layout();plt.savefig(reports_dir/'target_distribution.png',dpi=150);plt.close()
    print(f'Winner {winner}; nested grouped RMSE={nested[winner]["metrics"]["rmse_mmol_g"]:.4f} mmol/g; coverage={calibration["empirical_coverage"]:.3f}; mean interval width={calibration["mean_interval_width_mg_g"]:.1f} mg/g; version={version}')
    return report

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--data',default='../../data/mgo_database_source_normalized.csv');ap.add_argument('--out',default='..');ap.add_argument('--trials',type=int,default=50);ap.add_argument('--timeout-seconds',type=int,default=None);ap.add_argument('--seed',type=int,default=42);ap.add_argument('--alpha',type=float,default=.10);ap.add_argument('--quick',action='store_true');ap.add_argument('--models',default=None,help='comma-separated model names, e.g. RandomForest,ExtraTrees');ap.add_argument('--imputation',default=DEFAULT_IMPUTATION);ap.add_argument('--no-missing-indicator',action='store_true')
    a=ap.parse_args();here=Path(__file__).resolve().parent
    data=Path(a.data);data=data if data.is_absolute() else (here/data).resolve()
    out=Path(a.out);out=out if out.is_absolute() else (here/out).resolve()
    train(data,out,trials=a.trials,timeout_seconds=a.timeout_seconds,seed=a.seed,alpha=a.alpha,quick=a.quick,models=[m.strip() for m in a.models.split(',') if m.strip()] if a.models else None,imputation=a.imputation,missing_indicator=not a.no_missing_indicator)
