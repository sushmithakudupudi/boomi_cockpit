from typing import Any, Dict, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services import push_notifications as push

router = APIRouter(prefix="/notifications", tags=["Failure Notifications"])


class SubscribeRequest(BaseModel):
    endpoint: str
    keys: Dict[str, str]
    expirationTime: Optional[float] = None


class UnsubscribeRequest(BaseModel):
    endpoint: str


@router.get("/vapid-key")
def vapid_key() -> Dict[str, str]:
    """Public key the browser uses to subscribe to push messages."""
    return {"publicKey": push.public_key()}


@router.get("/status")
def status() -> Dict[str, Any]:
    return {"subscriptions": len(push.list_subscriptions()), "pollSeconds": push.POLL_SECONDS}


@router.post("/subscribe")
def subscribe(req: SubscribeRequest) -> Dict[str, Any]:
    if not req.endpoint.startswith("https://") or "p256dh" not in req.keys or "auth" not in req.keys:
        raise HTTPException(status_code=400, detail="Not a valid push subscription.")
    push.add_subscription(req.model_dump())
    return {"subscribed": True}


@router.post("/unsubscribe")
def unsubscribe(req: UnsubscribeRequest) -> Dict[str, Any]:
    push.remove_subscription(req.endpoint)
    return {"subscribed": False}


@router.post("/test")
async def send_test() -> Dict[str, Any]:
    """Sends a test notification to every subscribed browser."""
    if not push.list_subscriptions():
        raise HTTPException(status_code=409, detail="No browser is subscribed yet. Enable alerts first.")
    result = await push.send_to_all("BoomiOps test alert", "Failure alerts are working. You will be notified when a Boomi execution fails.", tag="boomi-test")
    return result
