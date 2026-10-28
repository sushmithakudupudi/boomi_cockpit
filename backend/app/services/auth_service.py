"""Password hashing, sign-in and session management.

* Passwords: salted scrypt (stdlib, memory-hard). Stored as "scrypt$n$r$p$salt$hash".
* Sessions: a random token goes to the browser in an HttpOnly cookie; the database only keeps
  its SHA-256, so a leaked database cannot be used to hijack sessions.
* Sign-in failures return one generic error whether the email or the password was wrong, and an
  unknown email still costs a full hash check, so responses do not reveal which accounts exist.
* After MAX_FAILED_LOGINS consecutive failures the account is locked for LOCKOUT_MINUTES.
"""
import base64
import hashlib
import hmac
import logging
import re
import secrets
from dataclasses import dataclass
from datetime import timedelta
from typing import Optional

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..config import settings
from ..models.auth import LoginAttempt, Role, User, UserSession, utcnow

logger = logging.getLogger("auth")

SCRYPT_N, SCRYPT_R, SCRYPT_P, SCRYPT_LEN = 2 ** 14, 8, 1, 64
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MIN_PASSWORD = 8
ROLES = {
    "admin": "Full access, including user management",
    "operator": "Can triage, reprocess and build integrations",
    "viewer": "Read-only access",
}


class AuthError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


# --------------------------------------------------------------------------- passwords

def _b64(b: bytes) -> str:
    return base64.b64encode(b).decode()


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P, dklen=SCRYPT_LEN)
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, n, r, p, salt, digest = stored.split("$")
        if algo != "scrypt":
            return False
        expected = base64.b64decode(digest)
        actual = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt), n=int(n), r=int(r), p=int(p), dklen=len(expected))
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


# Used to spend the same time on unknown emails as on real ones.
_DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


def normalise_email(email: str) -> str:
    return (email or "").strip().lower()


def validate_new_credentials(email: str, password: str) -> None:
    if not EMAIL_RE.match(email) or len(email) > 254:
        raise AuthError(422, "invalid_email", "Enter a valid email address.")
    if len(password) < MIN_PASSWORD:
        raise AuthError(422, "weak_password", f"Password must be at least {MIN_PASSWORD} characters.")
    if not (re.search(r"[A-Za-z]", password) and re.search(r"\d", password)):
        raise AuthError(422, "weak_password", "Password must contain at least one letter and one number.")


# --------------------------------------------------------------------------- seed / users

def seed_roles(db: Session) -> None:
    existing = set(db.scalars(select(Role.name)))
    for name, desc in ROLES.items():
        if name not in existing:
            db.add(Role(name=name, description=desc))
    db.commit()


def role_by_name(db: Session, name: str) -> Role:
    role = db.scalar(select(Role).where(Role.name == name))
    if role is None:
        raise AuthError(422, "invalid_role", f"Unknown role '{name}'. Use one of: {', '.join(ROLES)}.")
    return role


def user_count(db: Session) -> int:
    return db.scalar(select(func.count(User.id))) or 0


def create_user(db: Session, email: str, password: str, full_name: str = "", role: str = "operator") -> User:
    email = normalise_email(email)
    validate_new_credentials(email, password)
    if db.scalar(select(User.id).where(User.email == email)) is not None:
        raise AuthError(409, "email_taken", "An account with this email already exists.")
    user = User(email=email, full_name=full_name.strip()[:120], password_hash=hash_password(password), role=role_by_name(db, role))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def bootstrap_admin(db: Session) -> None:
    """Create the admin from BOOTSTRAP_ADMIN_* env vars if nobody exists yet."""
    if not (settings.BOOTSTRAP_ADMIN_EMAIL and settings.BOOTSTRAP_ADMIN_PASSWORD) or user_count(db):
        return
    try:
        create_user(db, settings.BOOTSTRAP_ADMIN_EMAIL, settings.BOOTSTRAP_ADMIN_PASSWORD, "Administrator", "admin")
        logger.info("Created bootstrap admin %s", normalise_email(settings.BOOTSTRAP_ADMIN_EMAIL))
    except AuthError as e:
        logger.error("Bootstrap admin not created: %s", e.message)


# --------------------------------------------------------------------------- sign-in / sessions

@dataclass
class NewSession:
    token: str
    session: UserSession
    max_age: Optional[int]  # cookie lifetime in seconds; None = browser-session cookie


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _record(db: Session, email: str, success: bool, reason: str, ip: str, user: Optional[User]) -> None:
    db.add(LoginAttempt(email=email[:254], success=success, reason=reason, ip_address=ip[:64], user_id=user.id if user else None))


def login(db: Session, email: str, password: str, remember: bool, ip: str = "", user_agent: str = "") -> NewSession:
    email = normalise_email(email)
    user = db.scalar(select(User).where(User.email == email))
    now = utcnow()
    invalid = AuthError(401, "invalid_credentials", "Incorrect email or password.")

    if user is None:
        verify_password(password, _DUMMY_HASH)
        _record(db, email, False, "unknown_email", ip, None)
        db.commit()
        raise invalid

    if user.locked_until and user.locked_until > now:
        _record(db, email, False, "locked", ip, user)
        db.commit()
        minutes = max(1, int((user.locked_until - now).total_seconds() // 60) + 1)
        raise AuthError(423, "account_locked", f"Too many failed attempts. Try again in {minutes} minute{'s' if minutes != 1 else ''}.")

    if not verify_password(password, user.password_hash):
        user.failed_login_count += 1
        reason = "bad_password"
        if user.failed_login_count >= settings.MAX_FAILED_LOGINS:
            user.locked_until = now + timedelta(minutes=settings.LOCKOUT_MINUTES)
            user.failed_login_count = 0
            reason = "bad_password_locked"
        _record(db, email, False, reason, ip, user)
        db.commit()
        raise invalid

    if not user.is_active:
        _record(db, email, False, "inactive", ip, user)
        db.commit()
        raise AuthError(403, "account_disabled", "This account has been disabled. Contact an administrator.")

    user.failed_login_count = 0
    user.locked_until = None
    user.last_login_at = now
    lifetime = timedelta(days=settings.REMEMBER_ME_DAYS) if remember else timedelta(hours=settings.SESSION_HOURS)
    token = secrets.token_urlsafe(32)
    session = UserSession(user=user, token_hash=_token_hash(token), expires_at=now + lifetime,
                          ip_address=ip[:64], user_agent=user_agent[:255])
    db.add(session)
    _record(db, email, True, "ok", ip, user)
    # Housekeeping: drop this user's expired or revoked sessions.
    db.execute(delete(UserSession).where(UserSession.user_id == user.id,
                                         (UserSession.expires_at < now) | (UserSession.revoked_at.is_not(None))))
    db.commit()
    return NewSession(token, session, int(lifetime.total_seconds()) if remember else None)


def user_for_token(db: Session, token: Optional[str]) -> Optional[User]:
    if not token:
        return None
    session = db.scalar(select(UserSession).where(UserSession.token_hash == _token_hash(token)))
    if session is None or session.revoked_at is not None or session.expires_at <= utcnow():
        return None
    user = session.user
    return user if user.is_active else None


def logout(db: Session, token: Optional[str]) -> None:
    if not token:
        return
    session = db.scalar(select(UserSession).where(UserSession.token_hash == _token_hash(token)))
    if session and session.revoked_at is None:
        session.revoked_at = utcnow()
        db.commit()


# --------------------------------------------------------------------------- password reset

def reset_password(db: Session, email: str, new_password: str) -> None:
    email = normalise_email(email)
    user = db.scalar(select(User).where(User.email == email))
    if user is None or not user.is_active:
        raise AuthError(404, "account_not_found", "No active account found for that email.")
    validate_new_credentials(email, new_password)
    now = utcnow()
    user.password_hash = hash_password(new_password)
    user.failed_login_count = 0
    user.locked_until = None
    # Sign out everywhere: revoke all of this user's live sessions.
    for s in db.scalars(select(UserSession).where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None))):
        s.revoked_at = now
    db.commit()


def public_user(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "fullName": user.full_name,
        "role": user.role.name,
        "isActive": user.is_active,
        "lastLoginAt": user.last_login_at.isoformat() + "Z" if user.last_login_at else None,
        "createdAt": user.created_at.isoformat() + "Z" if user.created_at else None,
    }
