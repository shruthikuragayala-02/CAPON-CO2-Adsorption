import React, { useEffect, useState } from "react";
import {
  api,
  apiBase,
  useAuth,
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  Legend,
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Beaker,
  CheckCircle2,
  ChevronRight,
  Database,
  FlaskConical,
  Info,
  Loader2,
  LockKeyhole,
  Play,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Upload,
  Users,
  Workflow,
  AlertTriangle,
  Trash2,
  Eye,
  EyeOff,
  Metric,
  SectionTitle,
  Loading,
  Empty,
  inputDefaults,
  numFields,
  fieldBounds,
} from "../components/shared";

export function BatchPage() {
  const [file, setFile] = useState(null),
    [preview, setPreview] = useState([]),
    [result, setResult] = useState(null),
    [err, setErr] = useState(""),
    [busy, setBusy] = useState(false);
  const read = (f) => {
    setFile(f);
    setResult(null);
    if (f) {
      if (f.name.toLowerCase().endsWith(".csv")) {
        const rd = new FileReader();
        rd.onload = () =>
          setPreview(
            String(rd.result)
              .split(/\r?\n/)
              .slice(0, 5)
              .map((x) => x.split(",")),
          );
        rd.readAsText(f);
      } else setPreview([[`Excel workbook selected (${f.name}); the API will parse its sheet during prediction.`]]);
    }
  };
  const submit = async () => {
    if (!file) return;
    setBusy(true);
    setErr("");
    try {
      const r = await api.upload("/predict_batch", file);
      setResult(r);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const template = () => {
    const csv =
      "active_pct,active_component,precursor,promoter,ratio,synthesis_method,pretreatment_gas,pretreatment_flow,pretreatment_temperature,pretreatment_time,adsorption_gas,co2_percentage,adsorption_flow,adsorption_temperature,adsorption_time,surface_area,pore_volume,pore_size,application\n85,MgO,Mg(NO3)2·6H2O,NaNO3,1,Impregnation,N2,100,400,30,CO2,100,80,300,120,100,0.5,20,Fixed bed";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "mgo_batch_template.csv";
    a.click();
  };
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([result.result_csv], { type: "text/csv" }));
    a.download = "mgo_batch_predictions.csv";
    a.click();
  };
  return (
    <>
      <SectionTitle
        eyebrow="BATCH WORKFLOW"
        title="Batch prediction"
        desc="Upload a CSV or Excel table of experimental records and download predicted capacities."
        right={
          <button className="btn secondary" onClick={template}>
            <ArrowDownToLine size={16} /> Download template
          </button>
        }
      />
      <div className="grid-two batch-grid">
        <section className="panel upload-panel">
          <div className="panel-heading">
            <div>
              <h2>Upload experimental records</h2>
              <p>CSV or XLSX · up to 500 records</p>
            </div>
            <Upload size={20} />
          </div>
          <label className="dropzone">
            <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => read(e.target.files[0])} />
            <span className="upload-glyph">
              <Upload />
            </span>
            <b>{file ? file.name : "Choose a file or drag it here"}</b>
            <small>Use the downloadable template’s field names for best results.</small>
          </label>
          {preview.length > 0 && (
            <>
              <h3>Preview</h3>
              <div className="preview-box">
                {preview.map((r, i) => (
                  <div key={i}>
                    {r.slice(0, 7).join(" · ")}
                    {r.length > 7 ? " …" : ""}
                  </div>
                ))}
              </div>
            </>
          )}
          {err && <div className="alert danger">{err}</div>}
          <button className="btn primary wide" disabled={!file || busy} onClick={submit}>
            {busy ? <Loader2 size={16} className="spin" /> : <Play size={16} />} Run batch prediction
          </button>
        </section>
        <section className="panel batch-guide">
          <div className="eyebrow">INPUT GUIDE</div>
          <h2>One row per material / condition</h2>
          <p className="muted">
            Column headers should match the prediction form’s raw fields. The batch endpoint uses the same feature builder and deployed
            model.
          </p>
          <div className="guide-list">
            <div>
              <span>01</span>
              <p>
                <b>Composition</b>
                <small>active_pct, active_component, promoter, ratio, precursor</small>
              </p>
            </div>
            <div>
              <span>02</span>
              <p>
                <b>Operating conditions</b>
                <small>adsorption_temperature, adsorption_time, co2_percentage, adsorption_flow</small>
              </p>
            </div>
            <div>
              <span>03</span>
              <p>
                <b>Material properties</b>
                <small>surface_area, pore_volume, pore_size</small>
              </p>
            </div>
          </div>
          <div className="mini-note">
            <Info size={15} /> Input form supports missing optional measurements; model imputation is fit during training.
          </div>
        </section>
      </div>
      {result && (
        <section className="panel results-table">
          <div className="panel-heading">
            <div>
              <h2>Batch results</h2>
              <p>{result.count} records · predictions are saved to your history</p>
            </div>
            <button className="btn secondary" onClick={download}>
              <ArrowDownToLine size={16} /> Download CSV
            </button>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Capacity</th>
                  <th>mmol/g</th>
                  <th>Prediction interval · mg/g</th>
                  <th>Confidence</th>
                  <th>OOD status</th>
                </tr>
              </thead>
              <tbody>
                {result.results.map((x, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{x.capacity_mg_g.toFixed(2)}</td>
                    <td>{x.capacity_mmol_g.toFixed(3)}</td>
                    <td>{x.uncertainty ? `${x.uncertainty.lower_mg_g.toFixed(0)}–${x.uncertainty.upper_mg_g.toFixed(0)}` : "—"}</td>
                    <td>
                      {x.uncertainty ? (
                        <span
                          className={`status-pill ${x.confidence_flag === "high" ? "ok" : x.confidence_flag === "medium" ? "warn" : "danger"}`}
                        >
                          {x.confidence_flag}
                        </span>
                      ) : (
                        <span title={x.uncertainty_message}>Unavailable</span>
                      )}
                    </td>
                    <td>
                      {x.ood_warning ? (
                        <span className="status-pill warn">Check range</span>
                      ) : (
                        <span className="status-pill ok">Within range</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
