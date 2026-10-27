from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from contextlib import asynccontextmanager
import asyncio
from typing import List
import logging

from .config import settings
from .routes import (
    executions,
    companion,
    reprocess,
    atoms,
    topology,
    stats,
    system,
)
from .services.boomi_service import boomi_service

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("boomi_main")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Boomi Companion Command Center API...")
    # Asynchronously synchronize live Atoms & Executions from Dell Boomi AtomSphere
    asyncio.create_task(boomi_service.sync_from_boomi_platform())
    yield
    logger.info("Shutting down Boomi Companion Command Center...")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Autonomous Integration Operations & Self-Healing Hub API Gateway powered by Boomi Companion",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# WebSocket Connection Manager for Real-Time Telemetry
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket client connected. Total clients: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info(f"WebSocket client disconnected. Total clients: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.warning(f"Error broadcasting to client: {e}")

manager = ConnectionManager()

@app.websocket("/api/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Echo or handle incoming client ping
            await websocket.send_json({"event": "ack", "data": data})
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        manager.disconnect(websocket)

# Include Routers under /api
api_router = FastAPI()
app.include_router(executions.router, prefix=settings.API_PREFIX)
app.include_router(companion.router, prefix=settings.API_PREFIX)
app.include_router(reprocess.router, prefix=settings.API_PREFIX)
app.include_router(atoms.router, prefix=settings.API_PREFIX)
app.include_router(topology.router, prefix=settings.API_PREFIX)
app.include_router(stats.router, prefix=settings.API_PREFIX)
app.include_router(system.router, prefix=settings.API_PREFIX)

@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse(url="/docs")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=True)
