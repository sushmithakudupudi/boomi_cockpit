"""Shared test setup: an isolated SQLite database and a signed-in TestClient.

Import this module BEFORE `app.main` so the app picks up the temporary DATABASE_URL.
"""
import os
import sys
import tempfile

current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

_tmp = tempfile.mkdtemp(prefix="boomiops-test-")
os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(_tmp, "test.db").replace("\\", "/")

ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "Sup3r-secret-pass"


def signed_in_client():
    from fastapi.testclient import TestClient
    from app.main import app

    client = TestClient(app)
    if client.get("/api/auth/status").json()["setupRequired"]:
        r = client.post("/api/auth/setup", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD, "fullName": "Test Admin"})
        assert r.status_code == 201, r.text
    else:
        r = client.post("/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200, r.text
    return client
