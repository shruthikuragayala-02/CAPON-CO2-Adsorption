from fastapi import APIRouter,Depends,HTTPException
import optuna
from optuna.samplers import TPESampler
from ..schemas import OptimizeInput,PredictionInput
from ..security.auth import require_user
from ..services.prediction_service import runtime
router=APIRouter(tags=['optimization'])
DOMAIN={'active_pct':(0,100),'pretreatment_flow':(0,500),'pretreatment_temperature':(0,1000),'pretreatment_time':(0,1000),'co2_percentage':(0,100),'adsorption_flow':(0,1000),'adsorption_temperature':(0,1000),'adsorption_time':(0,5000),'surface_area':(0,5000),'pore_volume':(0,10),'pore_size':(0,1000)}
BASE={'active_pct':85,'active_component':'MgO','precursor':'Mg(NO3)2','promoter':'','ratio':'','synthesis_method':'impregnation','pretreatment_gas':'N2','pretreatment_flow':100,'pretreatment_temperature':400,'pretreatment_time':30,'adsorption_gas':'CO2','co2_percentage':100,'adsorption_flow':80,'adsorption_temperature':300,'adsorption_time':120,'surface_area':100,'pore_volume':0.5,'pore_size':20,'application':'fixed bed'}

@router.post('/optimize/conditions')
def optimize(req:OptimizeInput,user=Depends(require_user)):
    if not runtime.payload: raise HTTPException(503,'No deployed model')
    allowed=set(PredictionInput.model_fields)
    unknown=set(req.fixed)-allowed
    if unknown: raise HTTPException(422,f'Unknown fixed input fields: {sorted(unknown)}')
    try: user_fixed=PredictionInput.model_validate(req.fixed).model_dump(exclude_none=True)
    except Exception as e: raise HTTPException(422,f'Invalid fixed input: {e}')
    bounds={}
    for name,b in req.free.items():
        if name not in allowed or name in {'active_component','precursor','promoter','ratio','synthesis_method','pretreatment_gas','adsorption_gas','application'}:
            raise HTTPException(422,f'{name} is not an optimizable numeric input')
        if not isinstance(b,(list,tuple)) or len(b)!=2:
            raise HTTPException(422,f'Range for {name} must be [minimum, maximum]')
        lo,hi=map(float,b)
        if lo>=hi: raise HTTPException(422,f'Invalid range for {name}')
        domain=DOMAIN.get(name)
        if domain: lo=max(lo,domain[0]);hi=min(hi,domain[1])
        if name=='adsorption_temperature' and req.max_temperature is not None: hi=min(hi,float(req.max_temperature))
        if name=='adsorption_time' and req.max_time is not None: hi=min(hi,float(req.max_time))
        if hi<=lo: raise HTTPException(422,f'Constraint leaves no feasible range for {name}')
        bounds[name]=(lo,hi)
    fixed={**BASE,**user_fixed}
    for key,limit in [('adsorption_temperature',req.max_temperature),('adsorption_time',req.max_time)]:
        if key in fixed and key not in bounds and limit is not None:
            try: fixed_value=float(fixed[key])
            except (TypeError,ValueError): raise HTTPException(422,f'Fixed {key} must be numeric')
            if fixed_value>float(limit): raise HTTPException(422,f'Fixed {key} violates its hard maximum')
    if not bounds: raise HTTPException(422,'No feasible free numeric parameters')
    candidates=[]; best=-float('inf'); convergence=[]
    study=optuna.create_study(direction='maximize',sampler=TPESampler(seed=req.seed))
    def objective(trial):
        nonlocal best
        rec=dict(fixed)
        for name,(lo,hi) in bounds.items(): rec[name]=trial.suggest_float(name,lo,hi)
        # Bounds themselves are clipped to hard constraints; no post-hoc overwriting is performed.
        if req.max_temperature is not None and rec.get('adsorption_temperature',0)>req.max_temperature: raise optuna.TrialPruned('hard temperature constraint')
        if req.max_time is not None and rec.get('adsorption_time',0)>req.max_time: raise optuna.TrialPruned('hard time constraint')
        try: result=runtime.predict([rec],explain=False,persist_user=None)
        except Exception as e: raise HTTPException(422,f'Optimization candidate failed: {e}')
        unc=result.get('uncertainty')
        if not unc: raise HTTPException(503,'Deployed model has no uncertainty calibration; retrain before risk-aware optimization')
        mean=float(result['capacity_mg_g']); std=float(unc.get('sigma_mg_g',unc.get('std_mg_g')))
        score=mean if req.objective_mode=='mean' else mean-req.k*std
        if result['ood_warning']: score-=req.ood_penalty*max(0.0,float(unc['upper_mg_g']-unc['lower_mg_g'])/2)
        item={'conditions':rec,'prediction':{'capacity_mg_g':mean,'capacity_mmol_g':mean/44.01},'uncertainty':unc,
            'confidence_flag':result['confidence_flag'],'ood_warning':result['ood_warning'],'ood_features':result['ood_features'],'objective_value_mg_g':float(score)}
        candidates.append(item);best=max(best,score)
        convergence.append({'trial':trial.number+1,'best_objective_mg_g':best,'best_prediction_mg_g':max(candidates,key=lambda z:z['objective_value_mg_g'])['prediction']['capacity_mg_g']})
        return float(score)
    try: study.optimize(objective,n_trials=req.n_trials,timeout=req.timeout_seconds,show_progress_bar=False)
    except HTTPException: raise
    except Exception as e: raise HTTPException(422,f'Optuna condition search failed: {e}')
    # Keep only unique experimental settings after rounding numerical dimensions.
    distinct={}
    for c in sorted(candidates,key=lambda x:x['objective_value_mg_g'],reverse=True):
        key=tuple(sorted((k,round(float(v),4) if isinstance(v,(float,int)) else str(v)) for k,v in c['conditions'].items()))
        distinct.setdefault(key,c)
    top=list(distinct.values())[:5]
    return {'objective_mode':req.objective_mode,'k':req.k,'method':'Optuna TPE Bayesian optimisation','top_candidates':top,
        'convergence':convergence,'effective_bounds':{k:list(v) for k,v in bounds.items()},'best_value_mg_g':float(study.best_value) if study.best_trials else None,
        'warnings':['Model-guided screening only; no condition is experimentally validated.','OOD candidates are penalised and flagged; confidence may remain low.']}
