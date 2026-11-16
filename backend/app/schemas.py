from pydantic import BaseModel,Field,ConfigDict,model_validator
from typing import Optional
class PredictionInput(BaseModel):
    model_config=ConfigDict(extra='allow')
    active_pct:Optional[float]=Field(None,ge=0,le=100); active_component:Optional[str]=None
    precursor:Optional[str]=None; promoter:Optional[str]=None; ratio:Optional[str]=None; synthesis_method:Optional[str]=None
    pretreatment_gas:Optional[str]=None; pretreatment_flow:Optional[float]=Field(None,ge=0,le=500)
    pretreatment_temperature:Optional[float]=Field(None,ge=0,le=1000); pretreatment_time:Optional[float]=Field(None,ge=0,le=1000)
    adsorption_gas:Optional[str]=None; co2_percentage:Optional[float]=Field(None,ge=0,le=100)
    adsorption_flow:Optional[float]=Field(None,ge=0,le=1000); adsorption_temperature:Optional[float]=Field(None,ge=0,le=1000)
    adsorption_time:Optional[float]=Field(None,ge=0,le=5000); surface_area:Optional[float]=Field(None,ge=0,le=5000)
    pore_volume:Optional[float]=Field(None,ge=0,le=10); pore_size:Optional[float]=Field(None,ge=0,le=1000)
    application:Optional[str]=None
class OptimizeInput(BaseModel):
    fixed:dict=Field(default_factory=dict)
    free:dict=Field(default_factory=dict)
    objective_mode:str=Field(default='lower_bound',pattern='^(mean|lower_bound)$')
    k:float=Field(default=1.0,ge=0,le=10)
    ood_penalty:float=Field(default=1.0,ge=0,le=10)
    n_trials:int=Field(default=50,ge=1,le=2000)
    timeout_seconds:Optional[int]=Field(default=None,ge=1,le=3600)
    seed:int=42
    max_temperature:Optional[float]=None
    max_time:Optional[float]=None
    @model_validator(mode='after')
    def has_variables(self):
        if not self.free: raise ValueError('Select at least one free numeric parameter')
        return self
