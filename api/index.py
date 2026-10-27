"""Vercel serverless entry point: serves the FastAPI backend under /api/*."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"))

from app.main import app  # noqa: E402,F401
