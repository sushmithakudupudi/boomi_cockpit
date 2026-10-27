"""
AI documentation for Boomi integration processes.

The facts (steps, flow, referenced components, error handling) are read from the
process component XML, so nothing in the document is invented. When OpenAI is
configured it only adds a narrative summary on top of those facts, the same way
the Architecture Compiler adds review notes without rewriting the spec.
"""
import datetime
import json
import logging
import re
from collections import deque
from typing import Any, Dict, List, Optional

from . import revision_diff as diff
from .revision_service import RevisionError, revision_service

logger = logging.getLogger("process_docs")

SHAPE_NAMES = {
    "start": "Start",
    "stop": "Stop",
    "return": "Return Documents",
    "connectoraction": "Connector",
    "map": "Map",
    "dataprocess": "Data Process",
    "documentproperties": "Set Properties",
    "processproperties": "Set Process Properties",
    "decision": "Decision",
    "branch": "Branch",
    "route": "Route",
    "businessrules": "Business Rules",
    "catcherrors": "Try/Catch",
    "exception": "Exception",
    "notify": "Notify",
    "message": "Message",
    "processcall": "Process Call",
    "processroute": "Process Route",
    "flowcontrol": "Flow Control",
    "cleanse": "Cleanse",
    "combine": "Combine",
    "split": "Split",
    "doccache": "Add to Cache",
    "doccacheretrieve": "Retrieve from Cache",
    "doccacheremove": "Remove from Cache",
    "trycatch": "Try/Catch",
}
ERROR_SHAPES = {"catcherrors", "trycatch", "exception", "notify"}
GUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
NOISE_ATTRS = {"image", "x", "y", "name"}
MAX_CACHED = 100

# A saved revision never changes, so its generated documentation can be reused
_cache: Dict[tuple, Dict[str, Any]] = {}


def _config(shape_el) -> Dict[str, Any]:
    """The shape's main configuration element as {tag, attrs, refs}; secrets are masked."""
    cfg = diff._child(shape_el, "configuration")
    main = diff._children(cfg)[0] if cfg is not None and diff._children(cfg) else None
    if main is None:
        return {"tag": None, "attrs": {}, "refs": {}}
    attrs: Dict[str, str] = {}
    for k, v in diff._attrs(main).items():
        if k in NOISE_ATTRS or v == "":
            continue
        attrs[k] = diff.MASK if diff.SENSITIVE.search(k) else v
    refs = {}
    for el in main.iter():
        for k, v in diff._attrs(el).items():
            if k.endswith("Id") and v and not k.startswith("property") and (GUID.match(v) or k in ("connectionId", "operationId", "mapId", "processId")):
                refs[k] = v
    props = [p.attrib.get("name", "").replace("Dynamic Document Property - ", "") for p in main.iter() if diff._local(p.tag) in ("documentproperty", "processproperty")]
    msg = next((el.text.strip() for el in main.iter() if diff._local(el.tag) in ("msgTxt", "message", "notifyMessage") and el.text and el.text.strip()), None)
    out: Dict[str, Any] = {"tag": diff._local(main.tag), "attrs": attrs, "refs": refs}
    if props:
        out["properties"] = [p for p in props if p]
    if msg:
        out["message"] = msg[:300]
    return out


def extract(root) -> Dict[str, Any]:
    """Process metadata and shapes in flow order (breadth-first from the start shape)."""
    shapes: Dict[str, Dict[str, Any]] = {}
    for el in root.iter():
        if isinstance(el.tag, str) and diff._local(el.tag) == "shape" and el.attrib.get("name"):
            sid = el.attrib["name"]
            stype = el.attrib.get("shapetype", "").lower()
            nexts = []
            dp = diff._child(el, "dragpoints")
            for d in (diff._children(dp, "dragpoint") if dp is not None else []):
                a = diff._attrs(d)
                if a.get("toShape"):
                    nexts.append({"to": a["toShape"], "label": a.get("text") or a.get("identifier") or ""})
            shapes[sid] = {
                "id": sid,
                "type": stype,
                "typeName": SHAPE_NAMES.get(stype, stype.capitalize() or "Shape"),
                "label": el.attrib.get("userlabel", "").strip(),
                "config": _config(el),
                "next": nexts,
            }

    starts = [s for s in shapes.values() if s["type"] == "start"] or list(shapes.values())[:1]
    order, seen = [], set()
    queue = deque(s["id"] for s in starts)
    while queue:
        sid = queue.popleft()
        if sid in seen or sid not in shapes:
            continue
        seen.add(sid)
        order.append(shapes[sid])
        queue.extend(n["to"] for n in shapes[sid]["next"])
    order += [s for sid, s in shapes.items() if sid not in seen]  # unreachable shapes still get documented

    proc = root.find(".//{*}process")
    md = diff._metadata(root)
    return {
        "name": md.get("name") or "Boomi Process",
        "description": md.get("description", ""),
        "folder": md.get("folderFullPath") or md.get("folderName") or "",
        "options": {k: v for k, v in diff._attrs(proc).items()} if proc is not None else {},
        "shapes": order,
        "unreachable": [s["id"] for s in shapes.values() if s["id"] not in seen],
    }


def _title(s: Dict[str, Any]) -> str:
    return s["label"] or f"{s['typeName']} ({s['id']})"


def _mermaid(facts: Dict[str, Any]) -> str:
    def node(s):
        text = _title(s).replace('"', "'")
        if s["type"] in ("decision", "route", "businessrules"):
            return f'{s["id"]}{{"{text}"}}'
        if s["type"] in ("start", "stop", "return"):
            return f'{s["id"]}(["{text}"])'
        return f'{s["id"]}["{text}"]'

    lines = ["flowchart LR"] + [f"    {node(s)}" for s in facts["shapes"]]
    for s in facts["shapes"]:
        for n in s["next"]:
            label = n["label"].replace('"', "'").replace("|", "/")
            lines.append(f'    {s["id"]} -->|{label}| {n["to"]}' if label else f'    {s["id"]} --> {n["to"]}')
    return "\n".join(lines)


def _step_detail(s: Dict[str, Any], names: Dict[str, Dict[str, Any]]) -> List[str]:
    cfg, out = s["config"], []
    a = cfg["attrs"]
    if s["type"] == "connectoraction" or cfg["tag"] == "connectoraction":
        bits = [a.get("connectorType"), a.get("actionType")]
        if any(bits):
            out.append(f"Connector: `{a.get('connectorType', '?')}`, action `{a.get('actionType', '?')}`")
    elif s["type"] == "start" and cfg["tag"] == "noaction":
        out.append("Trigger: no data (runs on schedule or manual execution)")
    elif s["type"] == "stop":
        out.append("Continues other branches" if a.get("continue") == "true" else "Stops the whole execution")
    elif s["type"] == "processcall":
        out.append(f"Waits for sub-process: {a.get('wait', 'true')}; aborts on sub-process error: {a.get('abort', 'true')}")
    elif s["type"] == "decision" and a.get("comparison"):
        out.append(f"Comparison: `{a['comparison']}`")
    if cfg.get("properties"):
        out.append("Sets: " + ", ".join(f"`{p}`" for p in cfg["properties"]))
    if cfg.get("message"):
        out.append(f"Message: \"{cfg['message']}\"")
    for k, cid in cfg["refs"].items():
        ref = names.get(cid)
        kind = k[:-2]
        out.append(f"{kind[0].upper() + kind[1:]}: **{ref['name']}** ({ref['type']})" if ref else f"{kind[0].upper() + kind[1:]}: `{cid}`")
    if len(s["next"]) > 1:
        out.append("Paths: " + ", ".join(f"{n['label'] or 'path'} → {n['to']}" for n in s["next"]))
    return out


def _flow_list(facts: Dict[str, Any]) -> List[str]:
    """The connections as readable lines, for Word/PDF where a Mermaid diagram would show as code."""
    by_id = {s["id"]: s for s in facts["shapes"]}
    out = []
    for s in facts["shapes"]:
        for n in s["next"]:
            target = _title(by_id[n["to"]]) if n["to"] in by_id else n["to"]
            out.append(f"- **{_title(s)}** → **{target}**" + (f" (when {n['label']})" if n["label"] else ""))
    return out or ["- The process has no connected shapes."]


def build_markdown(facts: Dict[str, Any], meta: Dict[str, Any], names: Dict[str, Dict[str, Any]],
                   ai_summary: Optional[str], mermaid: bool = True) -> str:
    shapes = facts["shapes"]
    md = [f"# {facts['name']}", ""]
    if ai_summary:
        md += ["## Summary (AI-generated)", "", ai_summary.strip(), ""]

    md += ["## Overview", "",
           "| Field | Value |", "|---|---|",
           f"| Component ID | `{meta.get('componentId')}` |",
           f"| Revision | v{meta.get('version')} |",
           f"| Folder | {facts['folder'] or '—'} |",
           f"| Last modified | {meta.get('modifiedDate') or '—'} by {meta.get('modifiedBy') or '—'} |",
           f"| Shapes | {len(shapes)} |",
           ""]
    if facts["description"]:
        md += ["**Description:** " + facts["description"], ""]

    md += ["## Process flow", ""]
    md += (["```mermaid", _mermaid(facts), "```"] if mermaid else _flow_list(facts)) + ["", "## Steps", ""]
    for i, s in enumerate(shapes, 1):
        md.append(f"{i}. **{_title(s)}**: {s['typeName']} shape")
        md += [f"   - {d}" for d in _step_detail(s, names)]
    md.append("")

    refs: Dict[str, str] = {}
    for s in shapes:
        for cid in s["config"]["refs"].values():
            refs.setdefault(cid, _title(s))
    if refs:
        md += ["## Referenced components", "", "| Component | Type | Used by |", "|---|---|---|"]
        for cid, used in refs.items():
            ref = names.get(cid)
            md.append(f"| {ref['name'] if ref else '`' + cid + '`'} | {ref['type'] if ref else 'unknown'} | {used} |")
        md.append("")

    errs = [s for s in shapes if s["type"] in ERROR_SHAPES]
    stops = [s for s in shapes if s["type"] in ("stop", "return")]
    md += ["## Error handling", ""]
    if errs:
        md += [f"- **{_title(s)}** ({s['typeName']})" for s in errs]
    else:
        md.append("- No Try/Catch, Exception or Notify shapes. A failing step fails the execution, which then shows in Process Reporting.")
    if stops:
        md.append(f"- Ends at: " + ", ".join(_title(s) for s in stops))
    if facts["unreachable"]:
        md.append(f"- Shapes not connected to the start shape: " + ", ".join(facts["unreachable"]))
    md.append("")

    if facts["options"]:
        md += ["## Process options", ""] + [f"- `{k}`: {v}" for k, v in facts["options"].items()] + [""]
    return "\n".join(md)


def plain_summary(facts: Dict[str, Any], names: Dict[str, Dict[str, Any]]) -> str:
    """Summary built only from the XML, used when OpenAI is not configured."""
    shapes = facts["shapes"]
    flow = " → ".join(_title(s) for s in shapes[:8]) + (" → …" if len(shapes) > 8 else "")
    used = {names[c]["name"] for s in shapes for c in s["config"]["refs"].values() if c in names}
    connectors = sorted({s["config"]["attrs"].get("connectorType") for s in shapes if s["config"]["attrs"].get("connectorType")})
    lines = [f"**{facts['name']}** has {len(shapes)} shapes: {flow}."]
    if facts["description"]:
        lines.append(f"**Description:** {facts['description']}")
    if connectors:
        lines.append("**Connectors:** " + ", ".join(f"`{c}`" for c in connectors))
    if used:
        lines.append("**Uses:** " + ", ".join(sorted(used)))
    branches = [s for s in shapes if s["type"] in ("decision", "branch", "route")]
    if branches:
        lines.append(f"**Branching:** {len(branches)} decision/branch shape(s)")
    has_errors = any(s["type"] in ERROR_SHAPES for s in shapes)
    lines.append("**Error handling:** " + ("present" if has_errors else "none, so a failing step fails the whole execution"))
    return "\n".join(lines)


async def _ai_summary(facts: Dict[str, Any], names: Dict[str, Dict[str, Any]]) -> Optional[str]:
    from .companion_ai import companion_ai_service

    client = companion_ai_service._openai_client
    if not client:
        return None
    compact = {
        "process": facts["name"],
        "description": facts["description"],
        "steps": [
            {"label": _title(s), "type": s["typeName"], "config": s["config"]["attrs"],
             "uses": [names[c]["name"] for c in s["config"]["refs"].values() if c in names],
             "next": [n["to"] for n in s["next"]]}
            for s in facts["shapes"]
        ],
    }
    try:
        res = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": (
                    "You document Dell Boomi integration processes for support engineers and business owners. "
                    "Using ONLY the process facts given, write: a 2-3 sentence plain-English summary of what the "
                    "integration does end to end; then '**Business purpose:**' in one sentence; then "
                    "'**Operational notes:**' with at most 4 short bullets on failure points, dependencies or "
                    "missing error handling. Do not invent systems, fields or schedules that are not in the facts. "
                    "Markdown only, no headings."
                )},
                {"role": "user", "content": json.dumps(compact)[:12000]},
            ],
            temperature=0.2,
            max_tokens=450,
        )
        return (res.choices[0].message.content or "").strip() or None
    except Exception as e:
        logger.warning(f"OpenAI process summary failed ({e}); returning XML-derived documentation only.")
        return None


async def generate(source: str, component_id: str, use_ai: bool = True,
                   version: Optional[int] = None) -> Dict[str, Any]:
    revs = await revision_service.revisions(source, component_id)
    meta = revs[0] if version is None else next((r for r in revs if r["version"] == version), None)
    if meta is None:
        raise RevisionError(404, "not_found", f"Revision {version} of {component_id} does not exist.")
    key = (source, component_id, meta["version"], use_ai)
    if key in _cache:
        return _cache[key]

    xml = await revision_service.definition(source, component_id, meta["version"])
    try:
        root = diff.parse_definition(xml)
    except diff.ComparisonError as e:
        raise RevisionError(422, "invalid_definition", str(e))
    try:
        names = {c["componentId"]: c for c in await revision_service.all_components(source)}
    except RevisionError:
        names = {}

    if diff.component_kind(root) == "process":
        result = await _process_result(root, meta, names, use_ai)
    else:
        result = await _component_result(root, meta, names, use_ai)
    result.update(source=source, componentId=component_id, version=meta["version"],
                  generatedAt=datetime.datetime.now().isoformat(timespec="seconds"))
    if len(_cache) >= MAX_CACHED:
        _cache.pop(next(iter(_cache)))
    _cache[key] = result
    return result


async def _component_result(root, meta: Dict[str, Any], names: Dict[str, Dict[str, Any]], use_ai: bool) -> Dict[str, Any]:
    from . import component_docs

    facts = component_docs.extract(root, meta)
    summary = await component_docs.ai_summary(facts, names) if use_ai else None
    markdown = component_docs.build_markdown(facts, meta, names, summary)
    return {
        "processName": facts["name"],
        "componentType": facts["typeLabel"],
        "markdown": markdown,
        "exportMarkdown": markdown,
        "mermaid": "",
        "steps": [],
        "summary": summary or component_docs.plain_summary(facts, names),
        "aiSummary": summary is not None,
        "modelUsed": "gpt-4o-mini" if summary else "xml-rules-engine",
    }


async def _process_result(root, meta: Dict[str, Any], names: Dict[str, Dict[str, Any]], use_ai: bool) -> Dict[str, Any]:
    facts = extract(root)
    summary = await _ai_summary(facts, names) if use_ai else None
    return {
        "processName": facts["name"],
        "componentType": "Process",
        "markdown": build_markdown(facts, meta, names, summary),
        "exportMarkdown": build_markdown(facts, meta, names, summary, mermaid=False),
        "mermaid": _mermaid(facts),
        "steps": [{"id": s["id"], "label": _title(s), "type": s["type"], "typeName": s["typeName"]} for s in facts["shapes"]],
        "summary": summary or plain_summary(facts, names),
        "aiSummary": summary is not None,
        "modelUsed": "gpt-4o-mini" if summary else "xml-rules-engine",
    }
