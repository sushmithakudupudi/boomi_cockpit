"""Process designer: turns a plain-language description into a draft blueprint in ArchForge.

The designer only writes a DRAFT. It never touches Boomi. A person reviews and edits the draft in ArchForge and
creates the process themselves with Build in Boomi (which asks for confirmation). Whatever the model returns is
validated against ArchForge's shape catalog first, so a draft can always be opened and built.
"""
import datetime
import json
import logging
import re
import secrets
from typing import Any, Dict, List, Optional

from . import blueprint_store
from .boomi_process_builder import CONNECTOR_SHAPE_IDS, START_SHAPE_IDS, plan_shapes

logger = logging.getLogger("process_designer")

MODEL = "gpt-4o-mini"
MAX_STAGES = 15
MAX_TOKENS = 1400
DAILY_CAP = 30

START_SHAPES = list(START_SHAPE_IDS)
PROCESS_SHAPES = ["Message", "Set Properties", "Data Process (Split/Combine)", "Map & transform", "Business Rules & DPP Shape",
                  "Decision & Route Shapes", "Try/Catch & Set Properties", "Notify", "Process Call", "Process Route",
                  "Branch", "Route", "Cleanse", "Find Changes", "Flow Control", "Retrieve From Cache", "Program Command",
                  "Agent"]
CONNECTOR_SHAPES = list(CONNECTOR_SHAPE_IDS)
END_SHAPES = ["Stop", "Return Documents", "Exception", "Add to Cache", "Remove From Cache"]
ALLOWED = set(START_SHAPES + PROCESS_SHAPES + CONNECTOR_SHAPES + END_SHAPES)

SYSTEM_PROMPT = f"""You design Dell Boomi integration processes as a left-to-right list of shapes for the ArchForge designer.

Use ONLY these shape names, exactly as written:
- Start shapes (first shape only): {json.dumps(START_SHAPES)}
- Process shapes: {json.dumps(PROCESS_SHAPES)}
- Connector shapes: {json.dumps(CONNECTOR_SHAPES)}
- End shapes (last shape): {json.dumps(END_SHAPES)}

Rules:
- Start with "Start - No Data" for scheduled or manual runs, or a source connector when something arrives (for example "Web Services Server (Listen)" for an incoming web request).
- End with "Stop", or "Return Documents" when a caller waits for a response.
- 3 to 12 shapes. Give every shape a short human label (what it does in this flow).
- "notes" says what the shape must do. Follow these conventions so the draft can be built as far as possible:
  * Boomi Platform API: "GET <Object>" or "QUERY <Object>", for example "QUERY Environment".
  * Set Properties: name the properties, for example "Set DDP_OrderId" or 'Set DDP_Region = "EU"'.
  * Data Process: for example "Base64 encode" or "Split documents on the orders array".
  * Message and Notify: the message text. Decision / Business Rules: the condition in plain words. Map: which fields map to which.
- Do not invent systems, hostnames, field names, credentials or secrets. Put every guess in "assumptions".
- If the description is too vague to design (no clear trigger, source, destination or purpose), set needsMoreInfo to true, ask up to 3 short questions, and return no stages.

Reply with ONLY this JSON:
{{"needsMoreInfo": false, "questions": [], "title": "short name", "businessRule": "rule in one sentence or empty",
 "stages": [{{"label": "...", "shape": "...", "notes": "..."}}], "assumptions": ["..."]}}"""


def _short(value: Any, limit: int) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()[:limit]


def sanitize(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Makes any model output buildable: known shapes only, a start first, an end last, sensible sizes."""
    assumptions: List[str] = [_short(a, 200) for a in (raw.get("assumptions") or []) if _short(a, 200)][:8]
    if raw.get("needsMoreInfo"):
        questions = [_short(q, 200) for q in (raw.get("questions") or []) if _short(q, 200)][:3]
        return {"needsMoreInfo": True, "questions": questions or ["What should start this process, and where should the data end up?"], "stages": []}

    stages: List[Dict[str, str]] = []
    for item in (raw.get("stages") or [])[:MAX_STAGES + 3]:
        if not isinstance(item, dict):
            continue
        shape, label, notes = _short(item.get("shape"), 60), _short(item.get("label"), 60), _short(item.get("notes"), 200)
        if shape not in ALLOWED:
            assumptions.append(f"'{shape or 'unknown'}' is not an ArchForge shape, so '{label or shape}' was added as a Message placeholder to configure by hand.")
            notes = _short(f"TODO: configure {shape or 'this step'}. {notes}", 200)
            shape = "Message"
        stages.append({"label": label or shape, "shape": shape, "notes": notes})

    if not stages:
        return {"needsMoreInfo": True, "questions": ["I could not turn that into shapes. What should start the process and what should it do?"], "stages": []}

    if len(stages) > MAX_STAGES:
        stages = stages[:MAX_STAGES]
        assumptions.append(f"The design was cut to {MAX_STAGES} shapes.")
    # A start shape belongs first only
    if stages[0]["shape"] not in START_SHAPES:
        stages.insert(0, {"label": "Start", "shape": "Start - No Data", "notes": ""})
        assumptions.append("No start was given, so a Start - No Data (scheduled or manual) start was added.")
    for st in stages[1:]:
        if st["shape"] in START_SHAPES:
            st["notes"] = _short(f"TODO: this was a second start ({st['shape']}). {st['notes']}", 200)
            st["shape"] = "Message"
    if stages[-1]["shape"] not in END_SHAPES:
        stages.append({"label": "End", "shape": "Stop", "notes": ""})

    title = _short(raw.get("title"), 60) or "Drafted integration"
    return {"needsMoreInfo": False, "title": title, "businessRule": _short(raw.get("businessRule"), 250), "stages": stages, "assumptions": assumptions}


def build_report(stages: List[Dict[str, str]]) -> Dict[str, Any]:
    """What the Build in Boomi step can create for real, and what will need configuring by hand."""
    plan = plan_shapes([{"label": s["label"], "selectedShapeOrConnector": s["shape"], "notes": s["notes"]} for s in stages])
    todo = {s["label"] for s in stages if s["notes"].startswith("TODO")}  # stand-ins for shapes ArchForge does not have
    manual = [p["label"] for p in plan if p.get("placeholder") or p.get("configure") or p["label"] in todo]
    return {"shapeCount": len(plan), "needsConfiguring": manual, "createdAsIs": len(plan) - len(manual)}


def _category(shape: str, index: int, last_connector: int) -> str:
    if index == 0:
        return "SOURCE SYSTEM"
    if shape in END_SHAPES:
        return "END SHAPE"
    if shape in CONNECTOR_SHAPES and index == last_connector:
        return "DESTINATION"
    return "MIDDLEWARE / SKILL"


def _drafts_today() -> int:
    today = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
    return sum(1 for d in blueprint_store.list_all() if d.get("origin") == "ai-designer" and (d.get("updatedAt") or "").startswith(today))


def save_draft(design: Dict[str, Any]) -> Dict[str, Any]:
    stages = design["stages"]
    stamp = int(datetime.datetime.now().timestamp() * 1000)
    connectors = [i for i, s in enumerate(stages) if s["shape"] in CONNECTOR_SHAPES]
    last_connector = connectors[-1] if connectors else -1
    doc = {
        "blueprintId": f"{secrets.randbelow(90) + 10}-{secrets.randbelow(9000) + 1000}-{secrets.randbelow(900) + 100}",
        "title": design["title"],
        "selectedPresetId": "",
        "stages": [
            {"id": f"stage-{stamp}-{i}", "stepNumber": f"STEP {i + 1:02d}", "category": _category(s["shape"], i, last_connector),
             "label": s["label"], "selectedShapeOrConnector": s["shape"], "notes": s["notes"]}
            for i, s in enumerate(stages)
        ],
        "businessRule": design.get("businessRule", ""),
        "settings": {"enableTryCatchBoundary": False, "separateDPPvsDDP": False, "enableDocumentSplitCombine": False,
                     "enforceIdempotentUpsert": False, "enable3xExponentialRetry": False, "deployInitialScheduleDisabled": True},
        "processName": re.sub(r"[^A-Za-z0-9]+", "_", design["title"]).strip("_")[:60],
        "status": "draft",
        "origin": "ai-designer",
        "assumptions": design.get("assumptions", []),
    }
    draft_id = "bp-" + secrets.token_hex(6)
    blueprint_store.put(draft_id, doc)
    return {"draftId": draft_id, **{k: doc[k] for k in ("title", "businessRule")}}


async def design_and_save(description: str, client: Any) -> Dict[str, Any]:
    """Designs a blueprint from the description and saves it as an ArchForge draft. Returns a summary for chat or the API."""
    description = _short(description, 2000)
    if len(description) < 10:
        return {"status": "needs_more_info", "questions": ["Describe what the integration should do: what starts it, what it does, and where the result goes."]}
    if client is None:
        return {"status": "unavailable", "reason": "No AI key is configured, so drafts cannot be generated."}
    if _drafts_today() >= DAILY_CAP:
        return {"status": "unavailable", "reason": f"Daily limit of {DAILY_CAP} AI drafts reached."}

    try:
        resp = await client.chat.completions.create(
            model=MODEL, temperature=0.2, max_tokens=MAX_TOKENS, response_format={"type": "json_object"},
            messages=[{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": description}],
        )
        raw = json.loads(resp.choices[0].message.content or "{}")
    except Exception as e:
        logger.warning(f"Design failed: {e}")
        return {"status": "error", "reason": f"The design could not be generated ({e.__class__.__name__}). Try again."}

    design = sanitize(raw if isinstance(raw, dict) else {})
    if design["needsMoreInfo"]:
        return {"status": "needs_more_info", "questions": design["questions"]}

    saved = save_draft(design)
    return {
        "status": "drafted", **saved,
        "stages": [{"label": s["label"], "shape": s["shape"], "notes": s["notes"]} for s in design["stages"]],
        "assumptions": design["assumptions"],
        "buildReport": build_report(design["stages"]),
        "next": "The draft is saved in ArchForge. Review every shape there, then use Build in Boomi (it asks for confirmation). Nothing has been created in Boomi.",
    }
