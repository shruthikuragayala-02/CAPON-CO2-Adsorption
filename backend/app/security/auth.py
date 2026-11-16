from datetime import datetime, timedelta, timezone
from uuid import uuid4
import bcrypt, jwt, hashlib
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from ..config import JWT_SECRET, ACCESS_MINUTES, REFRESH_DAYS
from ..database import db
bearer=HTTPBearer(auto_error=False)

def _password_bytes(pw:str)->bytes: return hashlib.sha256(pw.encode('utf-8')).hexdigest().encode('ascii')
def hash_password(pw:str)->str: return bcrypt.hashpw(_password_bytes(pw),bcrypt.gensalt(rounds=12)).decode()
def verify_password(pw:str,hashed:str)->bool:
    try: return bcrypt.checkpw(_password_bytes(pw),hashed.encode())
    except Exception: return False

def create_access(user):
    now=datetime.now(timezone.utc)
    return jwt.encode({'sub':str(user['id']),'role':user['role'],'username':user['username'],'iat':now,'exp':now+timedelta(minutes=ACCESS_MINUTES),'type':'access'},JWT_SECRET,algorithm='HS256')

def create_refresh(user):
    now=datetime.now(timezone.utc); jti=str(uuid4()); exp=now+timedelta(days=REFRESH_DAYS)
    token=jwt.encode({'sub':str(user['id']),'jti':jti,'iat':now,'exp':exp,'type':'refresh'},JWT_SECRET,algorithm='HS256')
    with db() as c: c.execute('INSERT INTO refresh_tokens(jti,user_id,expires_at) VALUES(?,?,?)',(jti,user['id'],exp.isoformat()))
    return token

def current_user(request:Request,creds:HTTPAuthorizationCredentials=Depends(bearer)):
    token=creds.credentials if creds else request.cookies.get('mgo_access')
    if not token: raise HTTPException(401,'Authentication required')
    try:
        payload=jwt.decode(token,JWT_SECRET,algorithms=['HS256'])
        if payload.get('type')!='access': raise ValueError()
        with db() as c: user=c.execute('SELECT id,username,email,role,disabled FROM users WHERE id=?',(int(payload['sub']),)).fetchone()
        if not user or user['disabled']: raise HTTPException(401,'Account unavailable')
        return dict(user)
    except HTTPException: raise
    except Exception: raise HTTPException(401,'Invalid or expired access token')

def require_user(user=Depends(current_user)):
    if user['role'] not in ('user','developer'): raise HTTPException(403,'User role required')
    return user

def require_developer(user=Depends(current_user)):
    if user['role']!='developer': raise HTTPException(403,'Developer role required')
    return user

def request_ip(req:Request): return req.client.host if req.client else ''
