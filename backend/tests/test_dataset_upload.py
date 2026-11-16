import os,tempfile,sys,shutil
from pathlib import Path
os.environ['DATABASE_PATH']=str(Path(tempfile.gettempdir())/'mgo_co2_test.sqlite')
os.environ['JWT_SECRET']='test-only-random-secret-0123456789-abcdef-0123456789'
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'backend'))
from fastapi.testclient import TestClient
from app.main import app
from app.security.auth import hash_password
import app.routers.auth as auth
import app.routers.developer as developer

def test_dataset_upload_reconstructs_original_unquoted_apparatus_commas(monkeypatch,tmp_path):
    auth.DEV_PASSWORD='upload-test-developer-password'; auth._dev_hash=hash_password(auth.DEV_PASSWORD)
    monkeypatch.setattr(developer,'PROJECT_DIR',tmp_path)
    data_dir=tmp_path/'data';data_dir.mkdir(parents=True)
    shutil.copy2(ROOT/'data/mgo_database_source_normalized.csv',data_dir/'mgo_database_source_normalized.csv')
    source=ROOT/'data/source_original/MgO database 345.csv'
    with TestClient(app) as c:
        login=c.post('/auth/developer-login',json={'username':'developer','password':'upload-test-developer-password'})
        assert login.status_code==200,login.text
        headers={'Authorization':'Bearer '+login.json()['access_token']}
        with source.open('rb') as f:
            r=c.post('/developer/dataset/upload?mode=replace',headers=headers,files={'file':('MgO database 345.csv',f,'text/csv')})
        assert r.status_code==200,r.text
        assert r.json()['uploaded_records']==345
        frame=developer.parse_upload(source.read_bytes(),source.name)
        assert frame.shape==(345,41)
        assert frame.iloc[218,40].strip()=='14'
        assert 'Q500' in frame.iloc[218,39]
