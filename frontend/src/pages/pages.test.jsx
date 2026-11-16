import React from "react";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
const auth = vi.hoisted(() => ({
  login: vi.fn().mockResolvedValue({ role: "user" }),
  register: vi.fn().mockResolvedValue({ role: "user" }),
}));
const pred = () => ({
  prediction_id: "abc12345",
  capacity_mg_g: 220.04,
  capacity_mmol_g: 5,
  uncertainty: {
    std_mg_g: 50,
    std_mmol_g: 1.136,
    lower_mg_g: 120,
    upper_mg_g: 320,
    lower_mmol_g: 2.727,
    upper_mmol_g: 7.271,
    confidence_level: 0.9,
    method: "Grouped normalized conformal",
    relative_width_pct: 90,
  },
  confidence_flag: "medium",
  uncertainty_message: null,
  uncertainty_estimate_mg_g: 100,
  uncertainty_estimate_mmol_g: 2.27,
  prediction_range_mg_g: [120, 320],
  uncertainty_label: "Grouped normalized conformal",
  ood_warning: false,
  ood_features: [],
  local_explanation: {
    type: "SHAP TreeExplainer",
    base_value_mg_g: 180,
    contributions: [
      { feature: "surface_area", shap_mg_g: 28, value: 100 },
      { feature: "adsorption_temperature", shap_mg_g: 12, value: 300 },
    ],
    sum_check: 220.04,
    additivity_adjustment_mg_g: 0.04,
  },
  model_version: "test-v1",
});
const apiMock = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn(), upload: vi.fn(), delete: vi.fn(), changePassword: vi.fn() }));
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ ...auth, user: { username: "tester", role: "user" }, logout: vi.fn() }) }));
vi.mock("../services/api", () => ({ api: apiMock, apiBase: "/api" }));
import { LoginPage, PredictPage, AnalysisPage, HistoryPage, OptimizePage, BatchPage } from "./index";
beforeEach(() => {
  localStorage.setItem("unit", "mg/g");
  apiMock.post.mockImplementation((path) =>
    path === "/predict"
      ? Promise.resolve(pred())
      : Promise.resolve({ top_candidates: [], convergence: [], warnings: [], method: "Optuna TPE Bayesian optimisation" }),
  );
  apiMock.get.mockImplementation((p) =>
    p === "/evaluation"
      ? Promise.resolve({ validation: {}, model: {}, runtime_seconds: 0 })
      : p === "/feature-importance"
        ? Promise.resolve([])
        : p === "/shap/importance"
          ? Promise.resolve([])
          : p === "/hpo"
            ? Promise.resolve({})
            : p === "/history?q="
              ? Promise.resolve({ items: [] })
              : Promise.resolve({ study_count: 22, valid_target_and_study_rows: 345 }),
  );
  apiMock.upload.mockResolvedValue({ count: 1, results: [pred()], result_csv: "capacity_mg_g\n220" });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.removeItem("unit");
});
describe("page interactions", () => {
  it("renders the login form with accessible labels", () => {
    render(<LoginPage />);
    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(screen.getByLabelText("Username or email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });
  it("switches between research-user and developer sign in", () => {
    render(<LoginPage />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent.trim())).toEqual(["Research user", "Developer"]);
    fireEvent.click(screen.getByRole("tab", { name: /Developer/ }));
    expect(screen.getByRole("heading", { name: "Developer sign in" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Developer/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: /Research user/ }));
    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
  });
  it("shows calibrated interval, confidence badge and additive Tree SHAP in mg/g", async () => {
    render(<PredictPage />);
    expect(screen.getByRole("heading", { name: "Predict capacity" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Predict capacity/i }));
    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith("/predict", expect.objectContaining({ active_pct: 85, adsorption_temperature: 300 })),
    );
    expect(await screen.findByText("220.0")).toBeInTheDocument();
    expect(screen.getByText(/120 – 320 mg\/g/)).toBeInTheDocument();
    expect(screen.getByText("MEDIUM CONFIDENCE")).toBeInTheDocument();
    expect(screen.getByText("Local Tree SHAP · additive")).toBeInTheDocument();
    expect(screen.getByText(/all contributions =/)).toBeInTheDocument();
  });
  it("converts the displayed prediction interval and SHAP values for mmol/g", async () => {
    localStorage.setItem("unit", "mmol/g");
    render(<PredictPage />);
    fireEvent.click(screen.getByRole("button", { name: /Predict capacity/i }));
    expect(await screen.findByText("5.00")).toBeInTheDocument();
    expect(screen.getByText(/2.73 – 7.27 mmol\/g/)).toBeInTheDocument();
    expect(screen.getByText("+0.636 mmol/g")).toBeInTheDocument();
  });
  it("exposes an optimizer objective selector and submits Optuna conditions", async () => {
    apiMock.post.mockImplementation((path) =>
      path === "/optimize/conditions"
        ? Promise.resolve({
            top_candidates: [
              {
                prediction: { capacity_mg_g: 300, capacity_mmol_g: 6.82 },
                uncertainty: { lower_mg_g: 180, upper_mg_g: 420, confidence_level: 0.9 },
                confidence_flag: "medium",
                ood_warning: true,
                conditions: { adsorption_temperature: 330, adsorption_time: 120, co2_percentage: 80, surface_area: 100 },
                objective_value_mg_g: 250,
              },
            ],
            convergence: [{ trial: 1, best_objective_mg_g: 250 }],
            warnings: ["Exploratory"],
            method: "Optuna TPE Bayesian optimisation",
          })
        : Promise.resolve(pred()),
    );
    render(<OptimizePage />);
    fireEvent.change(screen.getByLabelText("Optimization objective"), { target: { value: "mean" } });
    fireEvent.click(screen.getByRole("button", { name: /Run Optuna search/i }));
    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith(
        "/optimize/conditions",
        expect.objectContaining({ objective_mode: "mean", n_trials: 50, max_temperature: 400, max_time: 240 }),
      ),
    );
    expect(await screen.findByText("Top distinct candidates")).toBeInTheDocument();
    expect(screen.getByText("Outside training feature ranges: extrapolation flagged")).toBeInTheDocument();
  });
  it("renders interval, confidence and OOD columns in batch results", async () => {
    render(<BatchPage />);
    const file = new File(["active_pct\n85"], "batch.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText(/Choose a file|Choose a file or drag it here/i), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: /Run batch prediction/i }));
    await waitFor(() => expect(apiMock.upload).toHaveBeenCalled());
    expect(await screen.findByText("Prediction interval · mg/g")).toBeInTheDocument();
    expect(screen.getByText("Confidence")).toBeInTheDocument();
    expect(screen.getByText("OOD status")).toBeInTheDocument();
  });
  it("renders personal history and analysis gracefully", async () => {
    render(<HistoryPage />);
    expect(await screen.findByText(/No predictions found/)).toBeInTheDocument();
    cleanup();
    render(<AnalysisPage />);
    expect(await screen.findByRole("heading", { name: "Model analysis" })).toBeInTheDocument();
  });
});
