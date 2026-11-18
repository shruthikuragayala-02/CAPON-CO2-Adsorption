import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Outlet, Route, Routes, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  BookOpen,
  ChartNoAxesCombined,
  FlaskConical,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
  Sun,
  Upload,
  Workflow,
  X,
} from "lucide-react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import AuthBackground from "./components/AuthBackground";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import {
  Dashboard,
  LoginPage,
  PredictPage,
  BatchPage,
  OptimizePage,
  AnalysisPage,
  HistoryPage,
  SettingsPage,
  HelpPage,
  DeveloperPage,
} from "./pages";
import "./styles.css";

const SIDEBAR_KEY = "sidebar-collapsed";
const THEME_KEY = "capon-theme";
const MOBILE_QUERY = "(max-width: 850px)";

const store = {
  get(key, fallback) {
    try {
      return localStorage.getItem(key) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* storage unavailable: keep working without persistence */
    }
  },
};

function Protected({ children }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <div className="auth-wait">
        <span className="wait-orb" /> Opening CAPON…
      </div>;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  return children;
}

function RoleGate({ role, children }) {
  const { user } = useAuth();
  return user?.role === role ? children : <Navigate to="/" replace />;
}

const nav = [
  ["/", "Overview", LayoutDashboard],
  ["/predict", "Predict", FlaskConical],
  ["/batch", "Batch run", Upload],
  ["/optimize", "Optimize", Workflow],
  ["/analysis", "Analysis", ChartNoAxesCombined],
  ["/history", "History", History],
  ["/help", "About & help", BookOpen],
];

function Shell({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  const [mobile, setMobile] = React.useState(false); // mobile drawer
  const [collapsed, setCollapsed] = React.useState(() => store.get(SIDEBAR_KEY, "0") === "1"); // desktop rail
  const [theme, setTheme] = React.useState(() => store.get(THEME_KEY, "dark"));

  React.useEffect(() => {
    document.documentElement.dataset.theme = theme;
    store.set(THEME_KEY, theme);
  }, [theme]);

  React.useEffect(() => store.set(SIDEBAR_KEY, collapsed ? "1" : "0"), [collapsed]);
  React.useEffect(() => setMobile(false), [loc.pathname]);

  // one toggle for both layouts: drawer on phones, collapsible rail on desktop
  const toggleSidebar = React.useCallback(() => {
    if (window.matchMedia(MOBILE_QUERY).matches) setMobile((m) => !m);
    else setCollapsed((c) => !c);
  }, []);

  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleSidebar();
      } else if (e.key === "Escape") setMobile(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSidebar]);

  const isDev = user?.role === "developer";
  const items = isDev ? [...nav.slice(0, 1), ["/developer", "Developer console", ShieldCheck], ...nav.slice(1)] : nav;
  const pageTitle = [...items, ["/settings", "Settings"]].find((n) => n[0] === loc.pathname)?.[1] || "Console";
  const initial = user?.username?.slice(0, 1).toUpperCase();

  return (
    <div className={"app-shell" + (collapsed ? " collapsed" : "") + (isDev ? " dev-mode" : "")}>
      <div className="app-bg" aria-hidden="true">
        <AuthBackground />
      </div>
      <aside id="app-sidebar" className={"sidebar " + (mobile ? "open" : "")}>
        <div className="brand">
          <div className="brand-mark">
            <FlaskConical size={21} />
          </div>
          <div className="lbl">
            <b>CAPON</b>
            <span>CO₂ · MgO</span>
          </div>
          <button className="sidebar-close" onClick={() => setMobile(false)} aria-label="Close menu">
            <X />
          </button>
        </div>
        <div className="workspace-tag">
          WORKSPACE <span>{isDev ? "DEVELOPER" : "RESEARCH"}</span>
        </div>
        <nav aria-label="Main">
          {items.map(([to, label, Icon], i) => (
            <NavLink
              end={to === "/"}
              key={to}
              to={to}
              data-tip={label}
              style={{ "--i": i }}
              onClick={() => setMobile(false)}
              className={({ isActive }) => "nav-item " + (isActive ? "active" : "")}
            >
              <Icon size={18} />
              <span className="lbl">{label}</span>
              {label === "Developer console" && <i className="nav-secure" />}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="mini-model">
            <span className="pulse-dot" />
            <div className="lbl">
              <b>Prediction engine</b>
              <small>Research screening model</small>
            </div>
          </div>
          <button className="profile-row" data-tip="Settings" onClick={() => navigate("/settings")}>
            <div className="avatar">{initial}</div>
            <span className="lbl">
              <b>{user?.username}</b>
              <small>{isDev ? "Developer" : "Research user"}</small>
            </span>
            <Settings size={16} />
          </button>
          <button className="logout-link" data-tip="Sign out" onClick={logout}>
            <LogOut size={16} /> <span className="lbl">Sign out</span>
          </button>
        </div>
      </aside>
      {mobile && <div className="sidebar-shade" onClick={() => setMobile(false)} />}
      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="panel-btn"
              onClick={toggleSidebar}
              aria-label={collapsed ? "Open side panel" : "Close side panel"}
              aria-expanded={!collapsed}
              aria-controls="app-sidebar"
              title={(collapsed ? "Open" : "Close") + " side panel (Ctrl/⌘ + B)"}
            >
              {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
            </button>
            <button className="menu-btn" onClick={toggleSidebar} aria-label="Open menu" aria-expanded={mobile} aria-controls="app-sidebar">
              <Menu size={21} />
            </button>
            <div className="crumb">
              <span>CAPON</span>
              <b>/</b>
              <span>{pageTitle}</span>
            </div>
          </div>
          <div className="topbar-actions">
            <span className="top-status">
              <i /> API connected
            </span>
            <button className="theme-btn" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label="Toggle theme">
              {theme === "light" ? <Moon size={19} /> : <Sun size={19} />}
            </button>
            <button className="top-user" onClick={() => navigate("/settings")} aria-label="Settings">
              <span className="avatar small">{initial}</span>
            </button>
          </div>
        </header>
        <div className="page-wrap">
          <div className="page-anim" key={loc.pathname}>
            {children}
          </div>
          <footer className="page-footer">
            <span>CAPON · CO₂ Adsorption Platform</span>
            <span>Research screening · validate experimentally</span>
          </footer>
        </div>
      </main>
      <nav className="mobile-nav">
        {[
          ["/", "Home", LayoutDashboard],
          ["/predict", "Predict", FlaskConical],
          ["/optimize", "Optimize", Workflow],
          ["/history", "History", History],
        ].map(([p, l, I]) => (
          <NavLink key={p} end={p === "/"} to={p}>
            <I size={19} />
            <small>{l}</small>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

/** One persistent layout for every signed-in page, so the sidebar keeps its state (and animates) between routes. */
function Layout() {
  return (
    <Protected>
      <Shell>
        <Outlet />
      </Shell>
    </Protected>
  );
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/register" element={user ? <Navigate to="/" replace /> : <LoginPage register />} />
      <Route path="/developer-login" element={user?.role === "developer" ? <Navigate to="/developer" replace /> : <LoginPage developer />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/predict" element={<PredictPage />} />
        <Route path="/batch" element={<BatchPage />} />
        <Route path="/optimize" element={<OptimizePage />} />
        <Route path="/analysis" element={<AnalysisPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route
          path="/developer"
          element={
            <RoleGate role="developer">
              <DeveloperPage />
            </RoleGate>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to={user ? "/" : "/login"} replace />} />
    </Routes>
  );
}

function Root() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
if ("serviceWorker" in navigator && import.meta.env.PROD) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));
