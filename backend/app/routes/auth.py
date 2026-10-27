from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db, init_db
from ..models.auth import User
from ..services import auth_service as auth
from ..services.auth_service import AuthError

router = APIRouter(prefix="/auth", tags=["Authentication"])

COOKIE = "boomiops_session"
# Reachable without signing in (everything else under /api requires a session).
PUBLIC_PATHS = {"/api/health"}


class LoginRequest(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(max_length=256)
    remember: bool = False


class SetupRequest(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(max_length=256)
    fullName: str = Field(default="", max_length=120)


class CreateUserRequest(SetupRequest):
    role: str = "operator"


class UserOut(BaseModel):
    id: int
    email: str
    fullName: str
    role: str
    isActive: bool
    lastLoginAt: Optional[str] = None
    createdAt: Optional[str] = None


def _raise(e: AuthError):
    raise HTTPException(status_code=e.status, detail={"code": e.code, "message": e.message})


def _db() -> Session:
    init_db()
    yield from get_db()


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    return (fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else ""))


def _token(request: Request) -> Optional[str]:
    header = request.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    return request.cookies.get(COOKIE)


def _set_cookie(request: Request, response: Response, new: auth.NewSession) -> None:
    secure = request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"
    response.set_cookie(COOKIE, new.token, max_age=new.max_age, httponly=True, secure=secure, samesite="lax", path="/")


# --------------------------------------------------------------------------- dependencies

def current_user(request: Request, db: Session = Depends(_db)) -> User:
    user = auth.user_for_token(db, _token(request))
    if user is None:
        raise HTTPException(status_code=401, detail={"code": "not_authenticated", "message": "Please sign in to continue."})
    return user


def require_user(request: Request, db: Session = Depends(_db)) -> Optional[User]:
    """Router-level guard for every protected /api route."""
    if request.url.path in PUBLIC_PATHS:
        return None
    return current_user(request, db)


def require_admin(user: User = Depends(current_user)) -> User:
    if user.role.name != "admin":
        raise HTTPException(status_code=403, detail={"code": "forbidden", "message": "Administrator access is required."})
    return user


# --------------------------------------------------------------------------- endpoints

@router.get("/status")
def auth_status(db: Session = Depends(_db)):
    """Whether first-run setup (creating the first admin) is still needed."""
    return {"setupRequired": auth.user_count(db) == 0}


@router.post("/setup", response_model=UserOut, status_code=201)
def setup_first_admin(body: SetupRequest, request: Request, response: Response, db: Session = Depends(_db)):
    """Create the first administrator. Only allowed while no users exist."""
    if auth.user_count(db):
        _raise(AuthError(409, "setup_complete", "Setup has already been completed. Sign in instead."))
    try:
        user = auth.create_user(db, body.email, body.password, body.fullName, "admin")
        new = auth.login(db, body.email, body.password, remember=False, ip=_client_ip(request), user_agent=request.headers.get("user-agent", ""))
    except AuthError as e:
        _raise(e)
    _set_cookie(request, response, new)
    return auth.public_user(user)


@router.post("/login", response_model=UserOut)
def login(body: LoginRequest, request: Request, response: Response, db: Session = Depends(_db)):
    try:
        new = auth.login(db, body.email, body.password, body.remember, _client_ip(request), request.headers.get("user-agent", ""))
    except AuthError as e:
        _raise(e)
    _set_cookie(request, response, new)
    return auth.public_user(new.session.user)


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: Session = Depends(_db)):
    auth.logout(db, _token(request))
    response.delete_cookie(COOKIE, path="/")


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return auth.public_user(user)


@router.get("/users", response_model=List[UserOut])
def list_users(_: User = Depends(require_admin), db: Session = Depends(_db)):
    return [auth.public_user(u) for u in db.scalars(select(User).order_by(User.created_at))]


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(body: CreateUserRequest, _: User = Depends(require_admin), db: Session = Depends(_db)):
    try:
        return auth.public_user(auth.create_user(db, body.email, body.password, body.fullName, body.role))
    except AuthError as e:
        _raise(e)
