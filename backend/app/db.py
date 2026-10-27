"""Database engine and session handling (SQLAlchemy 2.x).

SQLite is used by default (file under backend/storage); set DATABASE_URL to use Postgres.
Tables are created on first use, so no separate migration step is needed for this schema.
"""
import logging
import os
from typing import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings

logger = logging.getLogger("db")


class Base(DeclarativeBase):
    pass


def _normalise_url(url: str) -> str:
    # Hosted Postgres providers hand out postgres:// URLs; SQLAlchemy wants an explicit driver.
    if url.startswith("postgres://"):
        url = "postgresql+psycopg://" + url[len("postgres://"):]
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


DATABASE_URL = _normalise_url(settings.DATABASE_URL)
_is_sqlite = DATABASE_URL.startswith("sqlite")

if _is_sqlite:
    path = DATABASE_URL.split("sqlite:///", 1)[-1]
    if path and path != ":memory:":
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if _is_sqlite else {},
    pool_pre_ping=not _is_sqlite,
)

if _is_sqlite:
    @event.listens_for(engine, "connect")
    def _sqlite_fk_on(dbapi_conn, _):
        # SQLite ignores foreign keys (and ON DELETE CASCADE) unless asked.
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


_initialised = False


def init_db() -> None:
    """Create tables and seed reference data. Safe to call repeatedly."""
    global _initialised
    if _initialised:
        return
    from .models import auth  # noqa: F401  (registers tables on Base.metadata)
    from .services import auth_service

    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        auth_service.seed_roles(db)
        auth_service.bootstrap_admin(db)
    if os.getenv("VERCEL") and _is_sqlite:
        logger.warning("Using SQLite in /tmp on Vercel: users and sessions are lost on cold starts. Set DATABASE_URL.")
    _initialised = True
