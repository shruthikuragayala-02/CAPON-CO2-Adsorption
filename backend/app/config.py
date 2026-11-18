
from pathlib import Path
import os

BASE_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = BASE_DIR.parent
DATA_DIR = PROJECT_DIR / 'data'

# Database configuration
DATABASE_URL = os.getenv('DATABASE_URL', '').strip()
DB_PATH = Path(os.getenv('DATABASE_PATH', BASE_DIR / 'app.db'))

MODEL_PATH = Path(os.getenv('MODEL_PATH', BASE_DIR / 'saved_models/active_model.joblib'))
REPORT_DIR = Path(os.getenv('REPORT_DIR', BASE_DIR / 'reports'))

JWT_SECRET = os.getenv('JWT_SECRET', '')
DEV_PASSWORD = os.getenv('DEVELOPER_PASSWORD', '')

CORS_ORIGINS = os.getenv(
    'CORS_ORIGINS',
    'http://localhost:5173,http://127.0.0.1:5173'
).split(',')

ACCESS_MINUTES = int(os.getenv('ACCESS_TOKEN_MINUTES', '20'))
REFRESH_DAYS = int(os.getenv('REFRESH_TOKEN_DAYS', '14'))
COOKIE_SECURE = os.getenv('COOKIE_SECURE', 'false').lower() == 'true'
