# Dataset audit and source schema

## Files and handling

The supplied input was a CP1252 CSV named `MgO database 345.csv`; no `.xlsx` was attached. The project retains a normalized copy at `data/mgo_database_source_normalized.csv`. The two paper excerpt text files and the UTF-16LE original training script are preserved in `docs/` as reference materials. No optional pre-trained model artifact was supplied.

The CSV begins with three grouped-header rows. Valid rows are identified by a numeric first column. There are 345 such records. The source has 41 intended columns, with target capacity at zero-based column 21 and Study ID at index 40. A count check confirms 345 numeric capacities and 22 studies.

The source contains 41 records where a comma inside an apparatus description was not quoted. These lines have two extra CSV fields; data after apparatus would otherwise shift and the Study ID would be misread. For those records, fields from intended index 39 through the split apparatus fragments are joined, and the final source field is restored to Study ID index 40. All records are retained. The row numbers are recorded in `data/dataset_inspection.json`.

## Numeric parsing and values

Approximation prefixes such as `~380` are retained in the source and parsed to the numeric portion for modeling/summary; the approximation count is reported. Non-numeric values such as `N/A` remain missing; they are not set to zero. Ratio strings such as `1:2`, `0.85:1`, and decimals are parsed only by the source feature logic. Input categories are preserved as raw text for rule-based descriptors.

## Observed audit results

- Valid observations: 345.
- Distinct Study IDs: 22.
- Source columns: 41.
- Capacity: min 0; median 270; mean 308.923; max 876 mg/g.
- Exact duplicate full rows: 0.
- Zero capacity rows: 6 (kept; unusual values are not automatically removed).
- Approximation marker in target: 36 rows.
- IQR capacity outlier candidates: 0; no rows were removed or modified based on outlier flags.
- Missing surface area: 119; pore volume: 126; pore size: 198; adsorption flow: 82; pretreatment flow: 54; pretreatment time: 55.

The complete per-column blank/NA counts, target quantiles, study distribution, source-file name, repair line list and normalized dataset SHA-256 are in `dataset_inspection.json`.

## Feature/label exclusion

Capacity at index 21 is the only label. Study ID at index 40 is used for grouped splitting only. No sample identifier, row number, study ID, target, or post-measurement capacity loss enters `build_features`. See `backend/ml/features.py` for the raw-column mapping and fixed transformation order.
