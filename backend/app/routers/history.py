import json
from fastapi import APIRouter,Depends,HTTPException
from ..database import db
from ..security.auth import current_user
router=APIRouter(prefix='/history',tags=['history'])
@router.get('')
def list_history(q:str='',user=Depends(current_user)):
 with db() as c: rows=c.execute('SELECT id,input_json,result_json,created_at FROM predictions WHERE user_id=? ORDER BY created_at DESC LIMIT 500',(user['id'],)).fetchall()
 values=[{'id':r['id'],'inputs':json.loads(r['input_json']),'result':json.loads(r['result_json']),'created_at':r['created_at']} for r in rows]
 if q: values=[x for x in values if q.lower() in json.dumps(x).lower()]
 return {'items':values,'count':len(values)}
@router.get('/{pid}')
def detail(pid:str,user=Depends(current_user)):
 with db() as c: r=c.execute('SELECT * FROM predictions WHERE id=? AND user_id=?',(pid,user['id'])).fetchone()
 if not r: raise HTTPException(404,'Prediction not found')
 return {'id':r['id'],'inputs':json.loads(r['input_json']),'result':json.loads(r['result_json']),'created_at':r['created_at']}
@router.delete('/{pid}')
def delete(pid:str,user=Depends(current_user)):
 with db() as c: cur=c.execute('DELETE FROM predictions WHERE id=? AND user_id=?',(pid,user['id']))
 if not cur.rowcount: raise HTTPException(404,'Prediction not found')
 return {'deleted':True}
