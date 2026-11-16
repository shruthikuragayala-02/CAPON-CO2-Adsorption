import React, { useEffect, useState } from "react";
import AuthBackground from "../components/AuthBackground";
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

const ROLES = [
  ["user", "Research user", FlaskConical],
  ["developer", "Developer", ShieldCheck],
];

export function LoginPage({ developer = false, register: registerRoute = false }) {
  const { login, register: signup } = useAuth();
  // The role switch decides which sign-in the form performs; the route only sets the starting choice.
  const [role, setRole] = useState(developer ? "developer" : "user");
  const developerMode = role === "developer";
  const register = registerRoute && !developerMode; // accounts can only be self-registered as research users
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      let signedIn;
      if (register) signedIn = await signup(form);
      else signedIn = await login(form, developerMode);
      location.href = (signedIn?.role ?? (developerMode ? "developer" : "user")) === "developer" ? "/developer" : "/";
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };
  const pickRole = (r) => {
    if (r === role) return;
    setRole(r);
    setErr("");
    setShow(false);
    setForm((f) => ({ ...f, password: "" })); // never carry a typed password across roles
  };
  return (
    <div className={"auth-screen" + (developerMode ? " is-dev" : "")}>
      <AuthBackground />
      <div className="auth-brand">
        <div className="brand-mark">
          <FlaskConical size={23} />
        </div>
        <div>
          <b>CAPON</b>
          <span>CO₂ adsorption intelligence</span>
        </div>
      </div>
      <div className="auth-hero">
        <span className="hero-chip">CO₂ + MgO → MgCO₃</span>
        <p className="hero-title">
          Capture more carbon. <em>Screen smarter.</em>
        </p>
        <p className="hero-sub">
          Machine-learning predictions of CO₂ adsorption capacity for MgO-based sorbents, with calibrated uncertainty and explainable SHAP
          insights.
        </p>
        <ul className="hero-points">
          <li>
            <i /> Calibrated prediction intervals
          </li>
          <li>
            <i /> SHAP explanations
          </li>
          <li>
            <i /> Bayesian condition search
          </li>
        </ul>
      </div>
      <div className={"auth-card" + (developerMode ? " dev" : "")}>
        <div className="role-switch" role="tablist" aria-label="Sign in as" data-active={role}>
          <i className="role-thumb" aria-hidden="true" />
          {ROLES.map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={role === id}
              className={role === id ? "active" : ""}
              onClick={() => pickRole(id)}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
        <div className="role-swap" key={role}>
          <div className="auth-icon">{developerMode ? <ShieldCheck size={22} /> : <LockKeyhole size={22} />}</div>
          <div className="eyebrow">{developerMode ? "PRIVATE ACCESS" : "RESEARCH WORKSPACE"}</div>
          <h1>{developerMode ? "Developer sign in" : register ? "Create your account" : "Welcome back"}</h1>
          <p>
            {developerMode
              ? "Protected tools for training, datasets and model deployment."
              : "Explore MgO-based CO₂ adsorption predictions and analysis."}
          </p>
        </div>
        <form onSubmit={submit} key={"form-" + role}>
          {register && (
            <label>
              Work email
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="you@lab.org"
              />
            </label>
          )}
          <label>
            {register ? "Username" : "Username or email"}
            <input
              required
              autoComplete="username"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder={developerMode ? "developer" : "your username"}
            />
          </label>
          <label>
            Password
            <div className="password-wrap">
              <input
                type={show ? "text" : "password"}
                required
                minLength={register ? 10 : 1}
                autoComplete={register ? "new-password" : "current-password"}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder={register ? "At least 10 characters" : "Enter your password"}
              />
              <button type="button" className="icon-btn" onClick={() => setShow(!show)} aria-label="Toggle password visibility">
                {show ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>
          {err && <div className="alert danger">{err}</div>}
          <button className="btn primary wide" disabled={busy}>
            {busy ? <Loader2 className="spin" size={17} /> : null}
            {developerMode ? "Sign in to Developer Console" : register ? "Create account" : "Sign in"}
            <ArrowRight size={17} />
          </button>
        </form>
        {!developerMode && (
          <div className="auth-links">
            {!register && (
              <button
                onClick={async () => {
                  try {
                    await api.post("/auth/forgot-password", {});
                    setErr("If the account exists, reset instructions will be sent. Email delivery is not configured in this local setup.");
                  } catch (x) {
                    setErr(x.message);
                  }
                }}
              >
                Forgot password?
              </button>
            )}
            <span>
              {register ? "Already registered?" : "New to CAPON?"}{" "}
              <a href={register ? "/login" : "/register"}>{register ? "Sign in" : "Create account"}</a>
            </span>
          </div>
        )}
        {developerMode && (
          <p className="dev-note">
            <ShieldCheck size={14} />
            <span>
              Developer sessions are audited. Not a developer? Switch to <b>Research user</b> above.
            </span>
          </p>
        )}
      </div>
      <div className="auth-foot">For research screening and exploratory analysis only · Not a substitute for experimental validation</div>
    </div>
  );
}
