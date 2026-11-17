
from fastapi import FastAPI, Request
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from collections import defaultdict, deque
import hashlib
import time
import shutil
from contextlib import asynccontextmanager

from .config import CORS_ORIGINS, PROJECT_DIR, JWT_SECRET, MODEL_PATH, BASE_DIR
from .database import init_db, db
from .routers import (
    auth,
    prediction,
    analysis,
    history,
    optimization,
    developer,
    training,
)


@asynccontextmanager
async def lifespan(app):
    startup()
    yield


app = FastAPI(
    title="CAPON API — MgO CO₂ Adsorption Platform",
    version="1.0.0",
    description=(
        "Research-screening predictions with study-grouped validation. "
        "Capacity target stays in mg/g."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[x.strip() for x in CORS_ORIGINS if x.strip()],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

_rate_buckets = defaultdict(deque)


@app.middleware("http")
async def rate_limit(request: Request, call_next):
    ip = request.client.host if request.client else "unknown"
    now = time.time()

    is_auth = (
        request.url.path.startswith("/auth/")
        or request.url.path.startswith("/api/auth/")
    )

    key = (ip, "auth" if is_auth else "general")
    window = 300 if is_auth else 60
    limit = 20 if is_auth else 240

    bucket = _rate_buckets[key]

    while bucket and now - bucket[0] > window:
        bucket.popleft()

    if len(bucket) >= limit:
        return JSONResponse(
            status_code=429,
            content={"detail": "Rate limit exceeded; try again later."},
        )

    bucket.append(now)
    return await call_next(request)


def startup():
    if len(JWT_SECRET) < 32:
        raise RuntimeError(
            "Set JWT_SECRET to a random secret of at least "
            "32 characters before startup."
        )

    init_db()

    # Register the bundled normalized dataset once.
    dataset_path = PROJECT_DIR / "data" / "mgo_database_source_normalized.csv"

    if dataset_path.exists():
        digest = hashlib.sha256(dataset_path.read_bytes()).hexdigest()

        with db() as connection:
            existing = connection.execute(
                "SELECT 1 FROM dataset_versions LIMIT 1"
            ).fetchone()

            if not existing:
                import pandas as pd

                count = len(
                    pd.read_csv(dataset_path, header=None, engine="python")
                )

                version = "dataset-" + digest[:12]

                connection.execute(
                    """
                    INSERT INTO dataset_versions
                    (version, filename, sha256, row_count, notes)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        version,
                        dataset_path.name,
                        digest,
                        count,
                        "Bundled normalized input dataset",
                    ),
                )

                snapshot = (
                    PROJECT_DIR / "data" / "versions" / f"{version}.csv"
                )

                snapshot.parent.mkdir(parents=True, exist_ok=True)

                if not snapshot.exists():
                    shutil.copy2(dataset_path, snapshot)

    # Register the bundled trained model.
    if MODEL_PATH.exists():
        try:
            import joblib
            import json

            artifact = joblib.load(MODEL_PATH)
            version = artifact.get("version", "unknown")

            report_path = BASE_DIR / "reports" / "evaluation.json"
            report = json.loads(report_path.read_text())

            metrics = report["validation"]["study_grouped_nested_5_fold"][
                report["model"]["name"]
            ]["metrics"]

            with db() as connection:
                connection.execute(
                    """
                    INSERT OR IGNORE INTO model_versions
                    (version, artifact_path, metrics_json, status)
                    VALUES (?, ?, ?, 'deployed')
                    """,
                    (version, str(MODEL_PATH), json.dumps(metrics)),
                )

                existing = connection.execute(
                    """
                    SELECT 1 FROM deployments
                    WHERE model_version = ? AND action = 'initial'
                    """,
                    (version,),
                ).fetchone()

                if not existing:
                    connection.execute(
                        """
                        INSERT INTO deployments (model_version, action)
                        VALUES (?, 'initial')
                        """,
                        (version,),
                    )

        except Exception as error:
            print(f"Model version registration warning: {error}")


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)

    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

    return response


@app.get("/health")
@app.get("/api/health")
def health():
    from .services.prediction_service import runtime

    return {
        "status": "ok",
        "model_loaded": bool(runtime.payload),
        "model_error": runtime.error,
    }


# Keep the original routes and also expose them under /api.
routers = (
    auth.router,
    prediction.router,
    analysis.router,
    history.router,
    optimization.router,
    developer.router,
    training.router,
)

for router in routers:
    app.include_router(router, prefix="/api")
    
@app.exception_handler(Exception)
async def unexpected_error(request, exc):
    print(f"Unexpected application error: {exc}")

    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


# Serve the React frontend if its production build exists.
FRONTEND_DIR = BASE_DIR / "frontend_dist"


class SPAStaticFiles(StaticFiles):
    async def get_response(self, path, scope):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as error:
            if error.status_code == 404:
                return await super().get_response("index.html", scope)
            raise


if FRONTEND_DIR.exists():
    app.mount(
        "/",
        SPAStaticFiles(directory=FRONTEND_DIR, html=True),
        name="frontend",
    )
