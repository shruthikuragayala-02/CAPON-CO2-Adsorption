import sqlite3
from contextlib import contextmanager
from .config import DB_PATH

def init_db():
    DB_PATH.parent.mkdir(parents=True,exist_ok=True)
    with sqlite3.connect(DB_PATH) as c:
        c.execute('PRAGMA foreign_keys=ON')
        c.executescript('''
        CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,username TEXT UNIQUE NOT NULL,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'user',disabled INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS refresh_tokens(jti TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at TEXT NOT NULL,revoked INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS predictions(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,input_json TEXT NOT NULL,result_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS batch_jobs(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,status TEXT NOT NULL,result_path TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS dataset_versions(id INTEGER PRIMARY KEY,version TEXT NOT NULL,filename TEXT NOT NULL,sha256 TEXT NOT NULL,row_count INTEGER NOT NULL,created_by INTEGER REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,notes TEXT);
        CREATE TABLE IF NOT EXISTS model_versions(id INTEGER PRIMARY KEY,version TEXT UNIQUE NOT NULL,artifact_path TEXT NOT NULL,metrics_json TEXT NOT NULL,created_by INTEGER REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,status TEXT NOT NULL DEFAULT 'candidate');
        CREATE TABLE IF NOT EXISTS training_jobs(id TEXT PRIMARY KEY,status TEXT NOT NULL,progress REAL NOT NULL DEFAULT 0,log TEXT NOT NULL DEFAULT '',result_json TEXT,error TEXT,created_by INTEGER REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS deployments(id INTEGER PRIMARY KEY,model_version TEXT NOT NULL,previous_version TEXT,actor_id INTEGER REFERENCES users(id),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,action TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS audit_logs(id INTEGER PRIMARY KEY,actor_id INTEGER REFERENCES users(id),action TEXT NOT NULL,detail TEXT,ip TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS auth_events(id INTEGER PRIMARY KEY,username TEXT,success INTEGER NOT NULL,detail TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS app_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        ''')

@contextmanager
def db():
    c=sqlite3.connect(DB_PATH,timeout=20); c.row_factory=sqlite3.Row; c.execute('PRAGMA foreign_keys=ON')
    try: yield c; c.commit()
    finally: c.close()

def audit(actor,action,detail='',ip=''):
    with db() as c: c.execute('INSERT INTO audit_logs(actor_id,action,detail,ip) VALUES(?,?,?,?)',(actor,action,detail,ip))
