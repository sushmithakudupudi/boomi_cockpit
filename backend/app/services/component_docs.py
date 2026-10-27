"""
Documentation for non-process Boomi components (connections, operations, maps, profiles, ...).

Like the process docs, every fact comes from the component XML; secrets are masked and
OpenAI (when configured) only adds a summary on top.
"""
import json
import logging
import re
from typing import Any, Dict, List, Optional, Tuple

from . import revision_diff as diff

logger = logging.getLogger("component_docs")

TYPE_LABELS = {
    "connector-settings": "Connection",
    "connector-action": "Operation",
    "transform.map": "Map",
    "transform.function": "Map Function",
    "profile.json": "JSON Profile",
    "profile.xml": "XML Profile",
    "profile.flatfile": "Flat File Profile",
    "profile.db": "Database Profile",
    "profile.edi": "EDI Profile",
    "processproperty": "Process Property",
    "crossref": "Cross Reference Table",
    "documentcache": "Document Cache",
    "certificate": "Certificate",
    "xslt": "XSLT Stylesheet",
    "script.processing": "Processing Script",
    "script.mapping": "Map Script",
    "tradingpartner": "Trading Partner",
    "webservice": "Web Service",
}
FIELD_TAG = re.compile(r"(Element|Entry|Field|Column)$")
REF_ATTRS = {"connectionId", "operationId", "mapId", "processId", "profileId",
             "fromProfile", "toProfile", "sourceProfile", "targetProfile"}
MAX_SETTINGS, MAX_ROWS, MAX_VALUE = 80, 150, 160


def type_label(ctype: str) -> str:
    return TYPE_LABELS.get(ctype, ctype.replace(".", " ").replace("-", " ").title() or "Component")


def _short_path(path: str) -> str:
    """'/Operation/Configuration/GenericOperationConfig@operationType' -> 'GenericOperationConfig › operationType'."""
    segs = [re.sub(r"\[#\d+\]", "", s) for s in diff._display(path).split("/") if s]
    tail = segs[-2:] if segs else ["(root)"]
    return " › ".join(tail).replace("@", " › ").replace("#text", "value")


def _settings(obj, skip: set) -> Tuple[List[Tuple[str, str]], int]:
    rows = []
    for path, value in diff.flatten(obj, skip_tags=skip).items():
        if not value or diff.GUID.fullmatch(value) or path.rsplit("@", 1)[-1] in REF_ATTRS:
            continue  # references get their own section
        shown = diff.MASK if diff.SENSITIVE.search(path) else (value if len(value) <= MAX_VALUE else value[:MAX_VALUE] + "…")
        rows.append((_short_path(path), shown))
    return rows[:MAX_SETTINGS], len(rows)


def _refs(obj) -> Dict[str, str]:
    """{component id: attribute that references it}"""
    out: Dict[str, str] = {}
    for el in obj.iter():
        if not isinstance(el.tag, str):
            continue
        for k, v in diff._attrs(el).items():
            if v and (k in REF_ATTRS or (diff.GUID.fullmatch(v) and k != "key")):
                out.setdefault(v, k)
    return out


def _fields(obj) -> List[str]:
    """Field names of a profile, as dotted paths."""
    out: List[str] = []

    def walk(node, parents):
        for c in diff._children(node):
            tag = diff._local(c.tag)
            name = c.attrib.get("name")
            if name and FIELD_TAG.search(tag):
                out.append(".".join(parents + [name]))
                walk(c, parents + [name])
            else:
                walk(c, parents)

    walk(obj, [])
    return out


def _mappings(root) -> List[Tuple[str, str]]:
    return [(diff._mapping_name(a, "from"), diff._mapping_name(a, "to")) for a in diff._mapping_model(root).values()]


def _functions(root) -> List[str]:
    return [f"{el.attrib.get('name') or el.attrib.get('type', 'Function')} ({el.attrib.get('type', '')})".replace(" ()", "")
            for el in root.iter() if isinstance(el.tag, str) and diff._local(el.tag) == "FunctionStep"]


def extract(root, meta: Dict[str, Any]) -> Dict[str, Any]:
    obj = diff._object(root)
    md = diff._metadata(root)
    ctype = root.attrib.get("type") or meta.get("type") or ""
    is_map = diff.component_kind(root) == "map"
    fields = [] if is_map else _fields(obj)
    # Profile trees and map rows are listed in their own sections, not as raw settings
    skip = {"Mappings", "Functions"} if is_map else ({"DataElements", "Elements"} if fields else set())
    settings, total = _settings(obj, skip)
    return {
        "name": md.get("name") or meta.get("name") or "Component",
        "type": ctype,
        "typeLabel": type_label(ctype),
        "subType": root.attrib.get("subType", ""),
        "description": md.get("description", ""),
        "folder": md.get("folderFullPath") or md.get("folderName") or meta.get("folderName") or "",
        "settings": settings,
        "settingsTotal": total,
        "refs": _refs(obj),
        "fields": fields,
        "mappings": _mappings(root) if is_map else [],
        "functions": _functions(root) if is_map else [],
    }


def _ref_name(cid: str, names: Dict[str, Dict[str, Any]]) -> str:
    ref = names.get(cid)
    return f"**{ref['name']}** ({type_label(ref['type'])})" if ref else f"`{cid}`"


def plain_summary(f: Dict[str, Any], names: Dict[str, Dict[str, Any]]) -> str:
    connector = f" for the `{f['subType']}` connector" if f["subType"] else ""
    lines = [f"**{f['name']}** is a {f['typeLabel']}{connector}."]
    if f["description"]:
        lines.append(f"**Description:** {f['description']}")
    if f["mappings"]:
        lines.append(f"**Mappings:** {len(f['mappings'])} field mapping(s)" + (f", {len(f['functions'])} function(s)" if f["functions"] else ""))
    if f["fields"]:
        lines.append(f"**Fields:** {len(f['fields'])} (e.g. " + ", ".join(f"`{x}`" for x in f["fields"][:5]) + ")")
    if f["settingsTotal"]:
        lines.append(f"**Configuration:** {f['settingsTotal']} setting(s)")
    if f["refs"]:
        lines.append("**Uses:** " + ", ".join(_ref_name(c, names) for c in list(f["refs"])[:6]))
    return "\n".join(lines)


def build_markdown(f: Dict[str, Any], meta: Dict[str, Any], names: Dict[str, Dict[str, Any]], ai_summary: Optional[str]) -> str:
    md = [f"# {f['name']}", ""]
    if ai_summary:
        md += ["## Summary (AI-generated)", "", ai_summary.strip(), ""]

    md += ["## Overview", "", "| Field | Value |", "|---|---|",
           f"| Component ID | `{meta.get('componentId')}` |",
           f"| Type | {f['typeLabel']} (`{f['type']}`) |"]
    if f["subType"]:
        md.append(f"| Connector | `{f['subType']}` |")
    md += [f"| Revision | v{meta.get('version')} |",
           f"| Folder | {f['folder'] or '—'} |",
           f"| Last modified | {meta.get('modifiedDate') or '—'} by {meta.get('modifiedBy') or '—'} |", ""]
    if f["description"]:
        md += ["**Description:** " + f["description"], ""]

    if f["mappings"]:
        md += ["## Mappings", "", "| From | To |", "|---|---|"]
        md += [f"| {a.replace('|', '/')} | {b.replace('|', '/')} |" for a, b in f["mappings"][:MAX_ROWS]]
        if len(f["mappings"]) > MAX_ROWS:
            md.append(f"| … | {len(f['mappings']) - MAX_ROWS} more |")
        md.append("")
    if f["functions"]:
        md += ["## Map functions", ""] + [f"- {x}" for x in f["functions"]] + [""]
    if f["fields"]:
        md += ["## Fields", ""] + [f"- `{x}`" for x in f["fields"][:MAX_ROWS]]
        if len(f["fields"]) > MAX_ROWS:
            md.append(f"- … {len(f['fields']) - MAX_ROWS} more")
        md.append("")

    md += ["## Configuration", ""]
    if f["settings"]:
        md += ["| Setting | Value |", "|---|---|"]
        md += [f"| {k.replace('|', '/')} | {v.replace('|', '/')} |" for k, v in f["settings"]]
        if f["settingsTotal"] > len(f["settings"]):
            md.append(f"| … | {f['settingsTotal'] - len(f['settings'])} more settings not shown |")
    else:
        md.append("- No configuration values beyond the overview.")
    md.append("")

    if f["refs"]:
        md += ["## Referenced components", "", "| Component | Referenced as |", "|---|---|"]
        md += [f"| {_ref_name(cid, names)} | `{attr}` |" for cid, attr in f["refs"].items()]
        md.append("")
    md += ["## Security", "", "- Values of password, token, key and credential settings are masked in this document.", ""]
    return "\n".join(md)


async def ai_summary(f: Dict[str, Any], names: Dict[str, Dict[str, Any]]) -> Optional[str]:
    from .companion_ai import companion_ai_service

    client = companion_ai_service._openai_client
    if not client:
        return None
    compact = {
        "component": f["name"], "type": f["typeLabel"], "connector": f["subType"], "description": f["description"],
        "settings": dict(f["settings"][:40]), "fields": f["fields"][:40], "mappings": f["mappings"][:40],
        "functions": f["functions"], "uses": [names[c]["name"] for c in f["refs"] if c in names],
    }
    try:
        res = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": (
                    "You document Dell Boomi components for support engineers and business owners. Using ONLY the "
                    "component facts given, write: a 2-3 sentence plain-English summary of what this component is "
                    "and what it is used for; then '**Business purpose:**' in one sentence; then "
                    "'**Operational notes:**' with at most 4 short bullets on configuration risks, dependencies or "
                    "things to check. Masked values are secrets: never guess them. Do not invent systems, fields or "
                    "endpoints that are not in the facts. Markdown only, no headings."
                )},
                {"role": "user", "content": json.dumps(compact)[:12000]},
            ],
            temperature=0.2,
            max_tokens=450,
        )
        return (res.choices[0].message.content or "").strip() or None
    except Exception as e:
        logger.warning(f"OpenAI component summary failed ({e}); returning XML-derived documentation only.")
        return None
