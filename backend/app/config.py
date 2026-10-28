import os
from typing import List
from dotenv import load_dotenv

# Search for .env in current dir or backend dir
env_paths = [
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"),
    os.path.join(os.getcwd(), "backend", ".env"),
    os.path.join(os.getcwd(), ".env"),
]
for p in env_paths:
    if os.path.exists(p):
        load_dotenv(p, override=True)

class Settings:
    PROJECT_NAME: str = "Boomi Companion Command Center (BoomiOps AI)"
    VERSION: str = "1.0.0"
    API_PREFIX: str = "/api"
    
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))
    
    # CORS
    CORS_ORIGINS: List[str] = [
        origin.strip() 
        for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173").split(",")
        if origin.strip()
    ]
    
    # Boomi AtomSphere Platform Settings
    BOOMI_ACCOUNT_ID: str = os.getenv("BOOMI_ACCOUNT_ID", "account-demo-enterprise-01")
    BOOMI_API_TOKEN: str = os.getenv("BOOMI_API_TOKEN", "")
    BOOMI_USERNAME: str = os.getenv("BOOMI_USERNAME", "")
    BOOMI_BASE_URL: str = os.getenv("BOOMI_BASE_URL", "https://api.boomi.com/api/rest/v1")
    # Default folder for Build in Boomi; any folder in the account can be picked (or created) in ArchForge
    BOOMI_ROOT_FOLDER_ID: str = os.getenv("BOOMI_ROOT_FOLDER_ID", "Rjo4ODQyMTg1")
    
    # AI Engine Keys
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")

    # Database: SQLite file locally; set DATABASE_URL (e.g. Postgres) for anything persistent.
    # Vercel's filesystem is read-only apart from /tmp, which does not survive cold starts.
    DATABASE_URL: str = os.getenv("DATABASE_URL", "") or (
        "sqlite:////tmp/boomiops.db" if os.getenv("VERCEL")
        else "sqlite:///" + os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "storage", "boomiops.db")
    )

    # Authentication
    SESSION_HOURS: int = int(os.getenv("SESSION_HOURS", "12"))
    REMEMBER_ME_DAYS: int = int(os.getenv("REMEMBER_ME_DAYS", "30"))
    MAX_FAILED_LOGINS: int = int(os.getenv("MAX_FAILED_LOGINS", "5"))
    LOCKOUT_MINUTES: int = int(os.getenv("LOCKOUT_MINUTES", "15"))
    # Optional: create this admin on startup when the users table is empty.
    BOOTSTRAP_ADMIN_EMAIL: str = os.getenv("BOOTSTRAP_ADMIN_EMAIL", "")
    BOOTSTRAP_ADMIN_PASSWORD: str = os.getenv("BOOTSTRAP_ADMIN_PASSWORD", "")

settings = Settings()
