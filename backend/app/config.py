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
    
    # AI Engine Keys
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")

settings = Settings()
