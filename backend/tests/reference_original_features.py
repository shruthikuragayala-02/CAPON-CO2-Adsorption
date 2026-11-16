"""Raw-column feature engineering preserved from the supplied training script.

Expected input is a headerless 41-column Data frame or equivalent with integer
column labels. Identifiers and capacity are never used as predictors.
"""
from __future__ import annotations
import re
import numpy as np
import pandas as pd

RAW_COLUMNS = 41

def _num(v):
    if pd.isna(v): return np.nan
    if isinstance(v, str):
        m = re.search(r"[-+]?\d*\.?\d+", v.replace("~", ""))
        return float(m.group()) if m else np.nan
    try: return float(v)
    except (TypeError, ValueError): return np.nan

def _clean(s): return re.sub(r"[\ufeff\s]+", " ", str(s)).strip()

def build_features(raw_df: pd.DataFrame) -> pd.DataFrame:
    """Transform source-schema raw rows into the original ordered feature matrix.

    Required source columns are zero-based indexes 0..40. API callers should
    first map named fields to this raw schema using app.services.raw_mapping.
    Output names/order follow the supplied train_mgo_model.py, with the documented
    Na2NO2 -> Na2NO2 correction applied to promoter parsing and melting point.
    """
    missing = [i for i in range(RAW_COLUMNS) if i not in raw_df.columns]
    if missing: raise ValueError(f"Raw input is missing source columns: {missing}")
    raw = raw_df.reset_index(drop=True).copy()
    prec = raw[3].map(_clean).str.lower()
    promo = raw[6].fillna("").map(_clean)
    pl = promo.str.lower()
    ratio = raw[7].map(lambda v: [float(x) for x in re.findall(r"\d*\.?\d+", str(v))] if pd.notna(v) else [])
    F = pd.DataFrame(index=raw.index)
    F["active_pct"] = raw[9].map(_num)
    F["is_MgO_CaCO3"] = (raw[2].map(_clean) == "MgO+CaCO3").astype(int)
    F["prec_nitrate"] = prec.str.contains("no3").astype(int)
    F["prec_acetate"] = prec.str.contains(r"ch3coo|ac\)2").astype(int)
    F["prec_carbonate_hydroxide"] = prec.str.contains(r"co3\)4|mg5|hydromagnesite|magnesite").astype(int)
    F["prec_hydroxide"] = prec.str.fullmatch(r"mg\(oh\)2|brucite").astype(int)
    F["prec_chloride"] = prec.str.contains("mgcl2|bischofite").astype(int)
    F["prec_commercial"] = prec.str.contains("commercial|^mgo$").astype(int)
    F["prec_organic_other"] = prec.str.contains("oc2h5|och3|c2o4|c3h5o3|c6h|c6h5o7").astype(int)
    F["has_promoter"] = (pl != "").astype(int)
    for name, pat in [("nitrate", "no3"), ("nitrite", "no2"), ("carbonate", "co3"), ("hydroxide", "koh|oh")]:
        F[f"promo_{name}"] = pl.str.contains(pat).astype(int)
    F["promo_Li"] = pl.str.contains("li").astype(int)
    F["promo_Na"] = pl.str.contains("na").astype(int)
    F["promo_K"] = pl.str.contains(r"k(?!oh)|koh").astype(int)
    F["promo_n_species"] = pl.map(lambda s: len(re.findall(r"[a-z]+\d*(?:no3|no2|co3|oh|hpo4)", s)))
    F["promo_ratio_first_frac"] = ratio.map(lambda r: r[0] / sum(r) if len(r) > 1 and sum(r) > 0 else np.nan)

    sm = raw[8].map(_clean).str.lower()
    def sm_group(s):
        if "impregnation" in s or "evaporation" in s: return "impregnation"
        if "precipitation" in s: return "precipitation"
        if "wet" in s: return "wet_mixing"
        if "hydrothermal" in s: return "hydrothermal"
        if "aerogel" in s or "sol-gel" in s or "p123" in s: return "template_sol_gel"
        if "calcination" in s or "ball" in s or "solid" in s or "microwave" in s: return "calcination_milling"
        return "other"
    sg = sm.map(sm_group)
    for g in sorted(sg.unique()): F[f"syn_{g}"] = (sg == g).astype(int)

    F["pre_gas_He"] = (raw[10].astype(str) == "He").astype(int)
    F["pre_flow"] = raw[12].map(_num); F["pre_temp"] = raw[13].map(_num); F["pre_time"] = raw[14].map(_num)
    F["ads_temp"] = raw[19].map(_num); F["ads_time"] = raw[20].map(_num)
    F["ads_CO2_pct"] = raw[17].map(_num); F["ads_flow"] = raw[18].map(_num)
    F["ads_diluent_He"] = (raw[15].astype(str) == "CO2/He").astype(int)
    app = raw[39].map(_clean).str.lower()
    F["fixed_bed"] = app.str.contains("fixed").astype(int)
    F["surface_area"] = raw[36].map(_num); F["pore_volume"] = raw[37].map(_num); F["pore_size"] = raw[38].map(_num)

    # Melting points in degC. Sodium nitrite formula corrected per explicit requirement.
    TM = {'LiNO3':255, 'NaNO3':307, 'KNO3':334, 'Na2NO2':271, 'Li2CO3':723,
          'Na2CO3':851, 'K2CO3':891, 'KOH':406, 'Na2HPO4':1000}
    rows = []
    chemical_pattern = r'(LiNO3|NaNO3|KNO3|Na2NO2|Li2CO3|Na2CO3|K2CO3|KOH|Na2HPO4)'
    for p, r in zip(promo, ratio):
        comps = re.findall(chemical_pattern, p)
        w = list(r) if len(r) == len(comps) else [1.0] * len(comps)
        sw = sum(w) or 1
        w = [x / sw for x in w]
        d = dict(Li=0, Na=0, K=0, NO3=0, NO2=0, CO3=0, tm_min=np.nan)
        for c, x in zip(comps, w):
            d['Li'] += x * ('Li' in c); d['Na'] += x * ('Na' in c); d['K'] += x * (c[0] == 'K')
            d['NO3'] += x * ('NO3' in c); d['NO2'] += x * ('NO2' in c); d['CO3'] += x * ('CO3' in c)
        if comps: d['tm_min'] = min(TM[c] for c in comps)
        rows.append(d)
    E = pd.DataFrame(rows, index=F.index); E.columns = ['frac_' + c for c in E.columns]
    F = pd.concat([F, E], axis=1)
    F["ads_minus_Tm_min"] = F["ads_temp"] - F["frac_tm_min"]
    F["promoter_loading"] = 100 - F["active_pct"]
    # Same constant-column pruning as the original pipeline, preserving surviving order.
    F = F.loc[:, F.nunique() > 1].astype(float)
    return F


def raw_records_to_frame(records: list[dict]) -> pd.DataFrame:
    """Map API-friendly named values into source columns without target/ID fields."""
    names = {"active_component":2,"precursor":3,"promoter":6,"ratio":7,"synthesis_method":8,
        "active_pct":9,"pretreatment_gas":10,"pretreatment_flow":12,"pretreatment_temperature":13,
        "pretreatment_time":14,"adsorption_gas":15,"co2_percentage":17,"adsorption_flow":18,
        "adsorption_temperature":19,"adsorption_time":20,"surface_area":36,"pore_volume":37,
        "pore_size":38,"application":39}
    frames=[]
    for rec in records:
        row={i:np.nan for i in range(RAW_COLUMNS)}
        for key, col in names.items():
            if key in rec and rec[key] is not None: row[col]=rec[key]
        frames.append(row)
    return pd.DataFrame(frames, columns=range(RAW_COLUMNS))
