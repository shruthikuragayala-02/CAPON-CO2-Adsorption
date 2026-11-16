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

export function SettingsPage() {
  const { user, logout } = useAuth();
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "light");
  const unit = localStorage.getItem("unit") || "mg/g";
  const [pw, setPw] = useState({ current_password: "", new_password: "" });
  const [notice, setNotice] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);
  const save = async (e) => {
    e.preventDefault();
    setErr("");
    setNotice("");
    try {
      await api.changePassword(pw);
      setPw({ current_password: "", new_password: "" });
      setNotice("Password updated successfully.");
    } catch (x) {
      setErr(x.message);
    }
  };
  return (
    <>
      <SectionTitle eyebrow="ACCOUNT" title="Profile & settings" desc="Manage your account preferences and security." />
      <div className="grid-two">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Profile</h2>
              <p>Signed-in workspace identity</p>
            </div>
            <Users />
          </div>
          <div className="profile-avatar">{user?.username?.slice(0, 1).toUpperCase()}</div>
          <div className="kv-row">
            <span>Username</span>
            <b>{user?.username}</b>
          </div>
          <div className="kv-row">
            <span>Email</span>
            <b>{user?.email}</b>
          </div>
          <div className="kv-row">
            <span>Role</span>
            <b>{user?.role}</b>
          </div>
          <button className="btn secondary wide" onClick={logout}>
            Sign out
          </button>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Preferences</h2>
              <p>Personal display preferences</p>
            </div>
            <Settings />
          </div>
          <label className="setting-row">
            Appearance
            <select value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <label className="setting-row">
            Preferred capacity unit
            <select
              value={unit}
              onChange={(e) => {
                setUnit(e.target.value);
                localStorage.setItem("unit", e.target.value);
              }}
            >
              <option>mg/g</option>
              <option>mmol/g</option>
            </select>
          </label>
          <div className="caption">The model’s target is internally mg/g. mmol/g is shown using mg/g ÷ 44.01.</div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Change password</h2>
              <p>Use at least 10 characters.</p>
            </div>
            <LockKeyhole />
          </div>
          <form onSubmit={save}>
            <label>
              Current password
              <input
                required
                type="password"
                value={pw.current_password}
                onChange={(e) => setPw({ ...pw, current_password: e.target.value })}
              />
            </label>
            <label>
              New password
              <input
                required
                minLength="10"
                type="password"
                value={pw.new_password}
                onChange={(e) => setPw({ ...pw, new_password: e.target.value })}
              />
            </label>
            {err && <div className="alert danger">{err}</div>}
            {notice && <div className="alert success">{notice}</div>}
            <button className="btn primary">Update password</button>
          </form>
        </section>
      </div>
    </>
  );
}
