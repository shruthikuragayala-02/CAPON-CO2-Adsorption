
from datetime import datetime, timezone
import jwt
import secrets

from fastapi import APIRouter, HTTPException, Request, Response, Depends
from pydantic import BaseModel, EmailStr, Field

from ..config import (
    DEV_PASSWORD,
    JWT_SECRET,
    REFRESH_DAYS,
    COOKIE_SECURE,
    ACCESS_MINUTES
)
from ..database import db, audit
from ..security.auth import (
    hash_password,
    verify_password,
    create_access,
    create_refresh,
    current_user,
    request_ip
)

router = APIRouter(prefix='/auth', tags=['auth'])


class Register(BaseModel):
    username: str = Field(
        min_length=3,
        max_length=48,
        pattern=r'^[a-zA-Z0-9_.-]+$'
    )
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)


class Login(BaseModel):
    username: str
    password: str


class ChangePassword(BaseModel):
    current_password: str
    new_password: str = Field(min_length=10, max_length=128)


_dev_hash = hash_password(DEV_PASSWORD) if DEV_PASSWORD else None


def cookie(response, token):
    response.set_cookie(
        'mgo_refresh',
        token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite='lax',
        max_age=REFRESH_DAYS * 86400,
        path='/auth'
    )


def set_session_cookies(response, user):
    access = create_access(user)
    refresh = create_refresh(user)

    response.set_cookie(
        'mgo_access',
        access,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite='lax',
        max_age=ACCESS_MINUTES * 60,
        path='/'
    )

    cookie(response, refresh)
    return access


def record(username, ok, detail=''):
    with db() as c:
        c.execute(
            'INSERT INTO auth_events(username,success,detail) VALUES(?,?,?)',
            (username, int(ok), detail)
        )


def active_dev_hash():
    with db() as c:
        row = c.execute(
            "SELECT value FROM app_settings WHERE key='developer_password_hash'"
        ).fetchone()

    return row['value'] if row else _dev_hash


# USER REGISTRATION
@router.post('/register')
def register(data: Register, request: Request, response: Response):

    with db() as c:
        try:
            cur = c.execute(
                'INSERT INTO users(username,email,password_hash,role) '
                'VALUES(?,?,?,?) RETURNING id',
                (
                    data.username,
                    data.email.lower(),
                    hash_password(data.password),
                    'user'
                )
            )

            new_user_id = cur.fetchone()['id']

            user = dict(
                c.execute(
                    'SELECT id,username,email,role FROM users WHERE id=?',
                    (new_user_id,)
                ).fetchone()
            )

        except Exception:
            raise HTTPException(
                409,
                'Username or email is already registered'
            )

    record(data.username, True, 'registration')
    access = set_session_cookies(response, user)

    return {
        'access_token': access,
        'token_type': 'bearer',
        'user': user
    }


# USER LOGIN
@router.post('/login')
def login(data: Login, request: Request, response: Response):

    with db() as c:
        row = c.execute(
            'SELECT * FROM users WHERE username=? OR email=?',
            (data.username, data.username.lower())
        ).fetchone()

    ok = bool(
        row
        and not row['disabled']
        and verify_password(data.password, row['password_hash'])
    )

    record(data.username, ok, 'user login')

    if not ok:
        raise HTTPException(401, 'Invalid credentials')

    user = dict(row)
    access = set_session_cookies(response, user)

    audit(
        user['id'],
        'login',
        'user login',
        request_ip(request)
    )

    return {
        'access_token': access,
        'token_type': 'bearer',
        'user': {
            k: user[k]
            for k in ('id', 'username', 'email', 'role')
        }
    }


# DEVELOPER LOGIN
@router.post('/developer-login')
def developer_login(data: Login, request: Request, response: Response):

    dev_hash = active_dev_hash()

    if not DEV_PASSWORD and dev_hash is None:
        raise HTTPException(
            503,
            'Developer login is not configured; set DEVELOPER_PASSWORD in the backend environment'
        )

    with db() as c:
        rows = c.execute(
            'SELECT success,created_at FROM auth_events '
            'WHERE username=? ORDER BY id DESC LIMIT 5',
            (data.username,)
        ).fetchall()

    consecutive = 0

    for e in rows:

        if e['success']:
            break

        try:
            created = datetime.fromisoformat(e['created_at'])

            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)

            age = (
                datetime.now(timezone.utc) - created
            ).total_seconds()

        except (ValueError, TypeError):
            age = 0

        if age < 300:
            consecutive += 1

    if consecutive >= 5:
        raise HTTPException(
            423,
            'Developer login locked for five minutes after repeated failed attempts'
        )

    ok = (
        data.username.lower() in ('developer', 'admin')
        and bool(dev_hash)
        and verify_password(data.password, dev_hash)
    )

    record(data.username, ok, 'developer login')

    if not ok:
        raise HTTPException(401, 'Invalid developer credentials')

    # Create the developer principal if it does not already exist.
    with db() as c:

        row = c.execute(
            "SELECT * FROM users WHERE username='__developer__'"
        ).fetchone()

        if not row:

            cur = c.execute(
                "INSERT INTO users(username,email,password_hash,role) "
                "VALUES('__developer__','developer@local.invalid',?,'developer') "
                "RETURNING id",
                (hash_password(secrets.token_urlsafe(48)),)
            )

            new_user_id = cur.fetchone()['id']

            row = c.execute(
                'SELECT * FROM users WHERE id=?',
                (new_user_id,)
            ).fetchone()

        user = dict(row)

    access = set_session_cookies(response, user)

    audit(
        user['id'],
        'login',
        'developer login',
        request_ip(request)
    )

    return {
        'access_token': access,
        'token_type': 'bearer',
        'user': {
            'id': user['id'],
            'username': 'developer',
            'email': user['email'],
            'role': 'developer'
        }
    }


# REFRESH SESSION
@router.post('/refresh')
def refresh(request: Request, response: Response):

    token = request.cookies.get('mgo_refresh')

    if not token:
        raise HTTPException(401, 'Refresh session missing')

    try:
        p = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=['HS256']
        )

        jti = p['jti']

        if p.get('type') != 'refresh':
            raise ValueError()

    except Exception:
        raise HTTPException(401, 'Invalid refresh session')

    with db() as c:

        r = c.execute(
            'SELECT user_id,revoked FROM refresh_tokens WHERE jti=?',
            (jti,)
        ).fetchone()

        if not r or r['revoked']:
            raise HTTPException(401, 'Refresh session has expired')

        c.execute(
            'UPDATE refresh_tokens SET revoked=1 WHERE jti=?',
            (jti,)
        )

        u = c.execute(
            'SELECT id,username,email,role,disabled FROM users WHERE id=?',
            (r['user_id'],)
        ).fetchone()

    if not u or u['disabled']:
        raise HTTPException(401, 'Account unavailable')

    user = dict(u)
    access = set_session_cookies(response, user)

    return {
        'access_token': access,
        'token_type': 'bearer',
        'user': {
            k: user[k]
            for k in ('id', 'username', 'email', 'role')
        }
    }


# LOGOUT
@router.post('/logout')
def logout(
    request: Request,
    response: Response,
    user=Depends(current_user)
):

    token = request.cookies.get('mgo_refresh')

    if token:
        try:
            jti = jwt.decode(
                token,
                JWT_SECRET,
                algorithms=['HS256']
            )['jti']

            with db() as c:
                c.execute(
                    'UPDATE refresh_tokens SET revoked=1 WHERE jti=?',
                    (jti,)
                )

        except Exception:
            pass

    response.delete_cookie('mgo_refresh', path='/auth')
    response.delete_cookie('mgo_access', path='/')

    audit(
        user['id'],
        'logout',
        'session closed',
        request_ip(request)
    )

    return {'ok': True}


# CHANGE PASSWORD
@router.post('/change-password')
def change_password(
    data: ChangePassword,
    user=Depends(current_user)
):

    with db() as c:
        r = c.execute(
            'SELECT password_hash FROM users WHERE id=?',
            (user['id'],)
        ).fetchone()

    if not r or not verify_password(
        data.current_password,
        r['password_hash']
    ):
        raise HTTPException(
            400,
            'Current password is incorrect'
        )

    with db() as c:
        c.execute(
            'UPDATE users SET password_hash=? WHERE id=?',
            (hash_password(data.new_password), user['id'])
        )

    audit(
        user['id'],
        'password_change',
        'password changed'
    )

    return {'ok': True}


# FORGOT PASSWORD
@router.post('/forgot-password')
def forgot_password():

    return {
        'ok': True,
        'message': 'If the account exists, follow the password reset instructions. Email delivery is not configured in this local installation.'
    }


# CURRENT USER
@router.get('/me')
def me(user=Depends(current_user)):
    return user
