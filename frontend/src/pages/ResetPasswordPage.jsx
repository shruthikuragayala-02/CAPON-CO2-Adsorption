
import React, { useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { api } from "../components/shared";
import AuthBackground from "../components/AuthBackground";
import { FlaskConical, LockKeyhole, ArrowRight, Loader2 } from "../components/shared";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [err, setErr] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setMessage("");

    if (password.length < 10) {
      setErr("Password must contain at least 10 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setErr("Passwords do not match.");
      return;
    }

    if (!token) {
      setErr("Invalid or missing password reset link.");
      return;
    }

    setBusy(true);

    try {
      const result = await api.post("/auth/reset-password", {
        token,
        new_password: password,
      });

      setMessage(
        result.message ||
          "Password reset successfully. Please log in with your new password."
      );
    } catch (x) {
      setErr(x.message || "Unable to reset password. The link may have expired.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
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

      <div className="auth-card">
        <div className="role-swap">
          <div className="auth-icon">
            <LockKeyhole size={22} />
          </div>

          <div className="eyebrow">ACCOUNT SECURITY</div>
          <h1>Reset your password</h1>
          <p>Choose a new password for your CAPON account.</p>
        </div>

        {message ? (
          <>
            <div className="alert success">{message}</div>
            <Link className="btn primary wide" to="/login">
              Back to sign in <ArrowRight size={17} />
            </Link>
          </>
        ) : (
          <form onSubmit={submit}>
            <label>
              New password
              <input
                type="password"
                required
                minLength={10}
                maxLength={128}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 10 characters"
              />
            </label>

            <label>
              Confirm new password
              <input
                type="password"
                required
                minLength={10}
                maxLength={128}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Enter your new password again"
              />
            </label>

            {err && <div className="alert danger">{err}</div>}

            <button className="btn primary wide" disabled={busy || !token}>
              {busy ? <Loader2 className="spin" size={17} /> : null}
              Reset password
              <ArrowRight size={17} />
            </button>

            <div className="auth-links">
              <Link to="/login">Back to sign in</Link>
            </div>
          </form>
        )}
      </div>

      <div className="auth-foot">
        For research screening and exploratory analysis only · Not a substitute for experimental validation
      </div>
    </div>
  );
}
