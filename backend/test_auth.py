"""End-to-end tests for sign-in: API behaviour, security rules and table relations."""
import test_support  # noqa: F401  (must come first: isolated database)

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.config import settings
from app.db import SessionLocal
from app.main import app
from app.models.auth import LoginAttempt, Role, User, UserSession
from app.routes.auth import COOKIE

ADMIN = {"email": "Owner@Example.com", "password": "Adm1n-password", "fullName": "Owner"}


def err(r):
    return r.json()["detail"]["code"]


def test_auth():
    c = TestClient(app)

    # ---- first run: setup required, protected APIs closed, health open
    assert c.get("/api/auth/status").json() == {"setupRequired": True}
    assert c.get("/api/health").status_code == 200
    for path in ("/api/executions", "/api/stats", "/api/revisions/components?source=sample"):
        r = c.get(path)
        assert r.status_code == 401 and err(r) == "not_authenticated", (path, r.text)
    assert c.get("/api/auth/me").status_code == 401

    # ---- validation on setup
    r = c.post("/api/auth/setup", json={**ADMIN, "password": "short1"})
    assert r.status_code == 422 and err(r) == "weak_password"
    r = c.post("/api/auth/setup", json={**ADMIN, "password": "onlyletters"})
    assert r.status_code == 422 and err(r) == "weak_password"
    r = c.post("/api/auth/setup", json={**ADMIN, "email": "not-an-email"})
    assert r.status_code == 422 and err(r) == "invalid_email"

    # ---- setup creates the first admin and signs them in (email is normalised)
    r = c.post("/api/auth/setup", json=ADMIN)
    assert r.status_code == 201, r.text
    assert r.json()["email"] == "owner@example.com" and r.json()["role"] == "admin"
    assert COOKIE in c.cookies
    assert "httponly" in r.headers["set-cookie"].lower() and "samesite=lax" in r.headers["set-cookie"].lower()
    assert c.get("/api/auth/me").json()["email"] == "owner@example.com"
    assert c.get("/api/stats").status_code == 200
    assert c.get("/api/auth/status").json() == {"setupRequired": False}
    r = c.post("/api/auth/setup", json={**ADMIN, "email": "second@example.com"})
    assert r.status_code == 409 and err(r) == "setup_complete"

    # ---- logout revokes the session server-side
    old_token = c.cookies.get(COOKIE)
    assert c.post("/api/auth/logout").status_code == 204
    assert c.get("/api/auth/me").status_code == 401
    replay = TestClient(app, headers={"Authorization": f"Bearer {old_token}"})
    assert replay.get("/api/auth/me").status_code == 401, "revoked token must not work again"

    # ---- wrong password and unknown email give the same generic error
    bad_pw = c.post("/api/auth/login", json={"email": ADMIN["email"], "password": "Wrong-pass1"})
    unknown = c.post("/api/auth/login", json={"email": "nobody@example.com", "password": "Wrong-pass1"})
    assert bad_pw.status_code == unknown.status_code == 401
    assert bad_pw.json() == unknown.json()

    # ---- login (case-insensitive email), remember-me sets a persistent cookie
    r = c.post("/api/auth/login", json={"email": "  OWNER@example.com ", "password": ADMIN["password"], "remember": True})
    assert r.status_code == 200, r.text
    assert f"max-age={settings.REMEMBER_ME_DAYS * 86400}" in r.headers["set-cookie"].lower()
    r = c.post("/api/auth/login", json={"email": ADMIN["email"], "password": ADMIN["password"]})
    assert "max-age" not in r.headers["set-cookie"].lower(), "non-remembered login uses a browser-session cookie"
    assert c.get("/api/auth/me").json()["lastLoginAt"]

    # ---- bearer token works for API clients too
    token = c.cookies.get(COOKIE)
    assert TestClient(app, headers={"Authorization": f"Bearer {token}"}).get("/api/auth/me").status_code == 200

    # ---- admin creates users; roles enforced
    r = c.post("/api/auth/users", json={"email": "op@example.com", "password": "Operat0r-pass", "fullName": "Op", "role": "operator"})
    assert r.status_code == 201 and r.json()["role"] == "operator", r.text
    r = c.post("/api/auth/users", json={"email": "OP@example.com", "password": "Operat0r-pass"})
    assert r.status_code == 409 and err(r) == "email_taken"
    r = c.post("/api/auth/users", json={"email": "x@example.com", "password": "Operat0r-pass", "role": "superuser"})
    assert r.status_code == 422 and err(r) == "invalid_role"
    assert {u["email"] for u in c.get("/api/auth/users").json()} == {"owner@example.com", "op@example.com"}

    op = TestClient(app)
    assert op.post("/api/auth/login", json={"email": "op@example.com", "password": "Operat0r-pass"}).status_code == 200
    assert op.get("/api/stats").status_code == 200
    r = op.get("/api/auth/users")
    assert r.status_code == 403 and err(r) == "forbidden"
    r = op.post("/api/auth/users", json={"email": "y@example.com", "password": "Operat0r-pass"})
    assert r.status_code == 403

    # ---- lockout after MAX_FAILED_LOGINS failures, even with the right password afterwards
    v = TestClient(app)
    for _ in range(settings.MAX_FAILED_LOGINS):
        assert v.post("/api/auth/login", json={"email": "op@example.com", "password": "nope-nope1"}).status_code == 401
    r = v.post("/api/auth/login", json={"email": "op@example.com", "password": "Operat0r-pass"})
    assert r.status_code == 423 and err(r) == "account_locked", r.text

    # ---- disabled accounts cannot sign in and existing sessions stop working
    with SessionLocal() as db:
        u = db.scalar(select(User).where(User.email == "op@example.com"))
        u.locked_until = None
        u.is_active = False
        db.commit()
    assert op.get("/api/auth/me").status_code == 401
    r = v.post("/api/auth/login", json={"email": "op@example.com", "password": "Operat0r-pass"})
    assert r.status_code == 403 and err(r) == "account_disabled"

    # ---- storage: no plaintext passwords or tokens; relations and cascades behave
    with SessionLocal() as db:
        owner = db.scalar(select(User).where(User.email == "owner@example.com"))
        assert owner.password_hash.startswith("scrypt$") and ADMIN["password"] not in owner.password_hash
        assert owner.role.name == "admin" and owner in db.scalar(select(Role).where(Role.name == "admin")).users
        assert all(s.token_hash != token and len(s.token_hash) == 64 for s in owner.sessions)
        assert owner.sessions and all(s.user_id == owner.id for s in owner.sessions)
        assert any(a.success for a in owner.login_attempts) and any(not a.success for a in owner.login_attempts)
        anon = db.scalars(select(LoginAttempt).where(LoginAttempt.email == "nobody@example.com")).all()
        assert anon and all(a.user_id is None and a.reason == "unknown_email" for a in anon)

        op_user = db.scalar(select(User).where(User.email == "op@example.com"))
        op_id = op_user.id
        assert db.scalars(select(UserSession).where(UserSession.user_id == op_id)).all()
        db.delete(op_user)
        db.commit()
        assert db.scalars(select(UserSession).where(UserSession.user_id == op_id)).all() == [], "sessions cascade-delete"
        orphaned = db.scalars(select(LoginAttempt).where(LoginAttempt.email == "op@example.com")).all()
        assert orphaned and all(a.user_id is None for a in orphaned), "audit rows are kept with user_id set to NULL"

        # a role that still has users cannot be deleted (ON DELETE RESTRICT)
        try:
            db.delete(db.scalar(select(Role).where(Role.name == "admin")))
            db.commit()
            raise AssertionError("deleting a role in use must fail")
        except Exception as e:
            db.rollback()
            assert "FOREIGN KEY" in str(e).upper() or "INTEGRITY" in type(e).__name__.upper(), e

    print("[PASS] auth")


if __name__ == "__main__":
    test_auth()
