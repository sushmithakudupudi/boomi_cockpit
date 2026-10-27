"""
Boomi component comparison engine.

Pure, I/O-free: takes two component XML definitions and returns a structured list of
meaningful changes. Revision retrieval lives in revision_service.py so this engine can be
used with live revisions, uploaded XML, or sample fixtures alike.

Normalisation rules
  * XML namespaces, whitespace and attribute order are ignored.
  * Canvas coordinates (x / y) and shape icons are ignored - they are not configuration.
  * Revision bookkeeping on the component root (version, modifiedDate, ...) is ignored.
  * Elements are matched by stable identifiers (shape name, propertyId, mapping target,
    function key, ...). Elements without one are matched by position and flagged ambiguous.
"""
import re
import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Optional, Set, Tuple

IGNORED_ATTRS = {"x", "y", "image", "position"}
ID_ATTRS = ("key", "propertyId", "id", "name", "elementId")
SENSITIVE = re.compile(r"password|passwd|secret|token|api[_-]?key|credential|private[_-]?key|authorization", re.I)
MASK = "[masked]"
POSITIONAL = re.compile(r"\[#([1-9]\d*)\]")

SETPROP_SHAPES = {"documentproperties", "processproperties"}
MAP_SHAPES = {"map"}
PROPERTY_SCOPES = {
    "dynamicdocument": "Dynamic Document Property",
    "dynamicprocess": "Dynamic Process Property",
    "process": "Process Property",
    "connector": "Connector Document Property",
    "meta": "Meta Information",
    "tradingpartner": "Trading Partner Property",
}

SHAPE_TYPE_LABELS = {
    "start": "Start", "stop": "Stop", "connectoraction": "Connector", "map": "Map",
    "documentproperties": "Set Properties", "processproperties": "Set Process Properties",
    "message": "Message", "decision": "Decision", "branch": "Branch", "route": "Route",
    "returndocuments": "Return Documents", "notify": "Notify", "dataprocess": "Data Process",
    "processcall": "Process Call", "processroute": "Process Route", "trycatch": "Try/Catch",
    "flowcontrol": "Flow Control", "cleanse": "Cleanse", "businessrules": "Business Rules",
    "exception": "Exception", "findchanges": "Find Changes", "doccacheretrieve": "Retrieve From Cache",
    "doccacheload": "Add To Cache", "doccacheremove": "Remove From Cache", "programcommand": "Program Command",
    "combine": "Combine", "split": "Split", "splitbybranch": "Split", "note": "Note", "addtocache": "Add To Cache",
    "retrievefromcache": "Retrieve From Cache", "removefromcache": "Remove From Cache",
    "catcherrors": "Try/Catch",
}
GUID = re.compile(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")

Flat = Dict[str, str]


class ComparisonError(ValueError):
    """Raised when a definition cannot be parsed or compared."""


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def parse_definition(xml_text: str) -> ET.Element:
    if not xml_text or not xml_text.strip():
        raise ComparisonError("Component definition is empty.")
    try:
        return ET.fromstring(xml_text.strip())
    except ET.ParseError as e:
        raise ComparisonError(f"Component definition is not valid XML: {e}")


def _attrs(el: ET.Element) -> Dict[str, str]:
    return {_local(k): v.strip() for k, v in el.attrib.items() if _local(k) not in IGNORED_ATTRS}


def _children(el: ET.Element, tag: Optional[str] = None) -> List[ET.Element]:
    return [c for c in el if isinstance(c.tag, str) and (tag is None or _local(c.tag) == tag)]


def _child(el: ET.Element, tag: str) -> Optional[ET.Element]:
    kids = _children(el, tag)
    return kids[0] if kids else None


def flatten(el: ET.Element, skip_tags: Optional[Set[str]] = None, prefix: str = "") -> Flat:
    """Flatten an element subtree into {path: value}, independent of formatting and attribute order."""
    out: Flat = {}
    skip = skip_tags or set()

    def walk(node: ET.Element, path: str) -> None:
        for k, v in _attrs(node).items():
            out[f"{path}@{k}"] = v
        text = " ".join((node.text or "").split())
        if text:
            out[f"{path}#text"] = text
        counters: Dict[str, int] = {}
        for c in _children(node):
            tag = _local(c.tag)
            if tag in skip:
                continue
            ident = next((c.attrib[a] for a in ID_ATTRS if a in c.attrib), None)
            if ident is not None:
                seg = f"{tag}[{ident.strip()}]"
            else:
                i = counters.get(tag, 0)
                counters[tag] = i + 1
                seg = f"{tag}[#{i}]"
            walk(c, f"{path}/{seg}")

    walk(el, prefix)
    return out


def _display(path: str) -> str:
    return path.replace("[#0]", "").lstrip("/") or "(root)"


def _mask(field: str, value: Optional[str]) -> Tuple[Optional[str], bool]:
    if value is not None and SENSITIVE.search(field):
        return MASK, True
    return value, False


def _display_flat(flat: Flat) -> Dict[str, str]:
    return {_display(k): _mask(k, v)[0] for k, v in flat.items()}


def _field_changes(old: Flat, new: Flat) -> List[Dict[str, Any]]:
    out = []
    for k in sorted(set(old) | set(new)):
        o, n = old.get(k), new.get(k)
        if o == n:
            continue
        masked = bool(SENSITIVE.search(k))
        out.append({
            "field": _display(k),
            "old": MASK if masked and o is not None else o,
            "new": MASK if masked and n is not None else n,
            "masked": masked,
            "positional": bool(POSITIONAL.search(k)),
        })
    return out


class _Changes:
    """Collects change entries and builds the summary."""

    def __init__(self, include_unchanged: bool):
        self.items: List[Dict[str, Any]] = []
        self.include_unchanged = include_unchanged

    def add(self, *, category: str, change: str, scope: str, title: str,
            shape_id: Optional[str] = None, shape_name: Optional[str] = None, shape_type: Optional[str] = None,
            old: Any = None, new: Any = None, fields: Optional[List[Dict[str, Any]]] = None,
            ambiguous: Optional[str] = None, source: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        if change == "unchanged" and not self.include_unchanged:
            return {}
        if fields and not ambiguous and any(f.get("positional") for f in fields):
            ambiguous = "Matched by position (no stable identifier); a reordering may appear as a modification."
        entry = {
            "id": f"chg-{len(self.items) + 1}",
            "category": category,
            "changeType": change,
            "scope": scope,
            "title": title,
            "shapeId": shape_id,
            "shapeName": shape_name,
            "shapeType": shape_type,
            "shapeTypeLabel": shape_type_label(shape_type) if shape_type else None,
            "old": old,
            "new": new,
            "fieldChanges": fields or [],
            "ambiguous": ambiguous,
            "source": source,
        }
        self.items.append(entry)
        return entry


def summarize(changes: List[Dict[str, Any]]) -> Dict[str, Any]:
    def count(items: List[Dict[str, Any]]) -> Dict[str, int]:
        c = {t: sum(1 for i in items if i["changeType"] == t) for t in ("added", "removed", "modified", "unchanged")}
        c["total"] = c["added"] + c["removed"] + c["modified"]
        return c

    summary = count(changes)
    summary["byCategory"] = {cat: count([c for c in changes if c["category"] == cat]) for cat in ("map", "setprops", "other")}
    summary["ambiguous"] = sum(1 for c in changes if c["ambiguous"])
    return summary


# --------------------------------------------------------------------------- component model

def component_kind(root: ET.Element) -> str:
    ctype = root.attrib.get("type", "")
    if ctype == "process" or root.find(".//{*}process") is not None:
        return "process"
    if ctype.startswith("transform.map") or root.find(".//{*}Map") is not None:
        return "map"
    return ctype or "generic"


def _object(root: ET.Element) -> ET.Element:
    obj = root.find("{*}object")
    return obj if obj is not None else root


def _metadata(root: ET.Element) -> Flat:
    md: Flat = {"name": root.attrib.get("name", "")}
    for a in ("folderFullPath", "folderName"):
        if a in root.attrib:
            md[a] = root.attrib[a]
    desc = root.find("{*}description")
    md["description"] = " ".join((desc.text or "").split()) if desc is not None else ""
    return md


def _diff_metadata(l: ET.Element, r: ET.Element, ch: _Changes, source: Optional[Dict[str, str]]) -> None:
    lm, rm = _metadata(l), _metadata(r)
    fields = _field_changes(lm, rm)
    if fields:
        ch.add(category="other", change="modified", scope="metadata", title="Component details",
               old=_display_flat(lm), new=_display_flat(rm), fields=fields, source=source)


# --------------------------------------------------------------------------- processes

def _shape_model(shape: ET.Element) -> Dict[str, Any]:
    cfg = _child(shape, "configuration")
    conns: Dict[str, Dict[str, str]] = {}
    dp = _child(shape, "dragpoints")
    if dp is not None:
        for i, d in enumerate(_children(dp, "dragpoint")):
            a = _attrs(d)
            conns[a.get("name") or f"toShape:{a.get('toShape', i)}"] = a
    return {
        "id": shape.attrib.get("name", ""),
        "type": shape.attrib.get("shapetype", ""),
        "label": shape.attrib.get("userlabel", "").strip(),
        "cfg_el": cfg,
        "conns": conns,
    }


def _shapes(root: ET.Element) -> Dict[str, Dict[str, Any]]:
    out: Dict[str, Dict[str, Any]] = {}
    for s in root.iter():
        if isinstance(s.tag, str) and _local(s.tag) == "shape" and s.attrib.get("name"):
            m = _shape_model(s)
            out[m["id"]] = m
    return out


def _category(shape_type: str) -> str:
    if shape_type in MAP_SHAPES:
        return "map"
    if shape_type in SETPROP_SHAPES:
        return "setprops"
    return "other"


def shape_type_label(shape_type: str) -> str:
    return SHAPE_TYPE_LABELS.get(shape_type, shape_type.title() if shape_type else "Shape")


def _shape_title(m: Dict[str, Any]) -> str:
    """Name as shown on the Boomi canvas: the user label, else a descriptive default."""
    if m["label"]:
        return m["label"]
    if m["type"] == "connectoraction" and m["cfg_el"] is not None:
        ca = m["cfg_el"].find("{*}connectoraction")
        if ca is not None:
            desc = " ".join(v for v in (ca.attrib.get("connectorType", ""), ca.attrib.get("actionType", "")) if v)
            if desc:
                return f"{desc} ({m['id']})"
    return f"{shape_type_label(m['type'])} ({m['id']})"


def _param_summary(prop: ET.Element) -> str:
    sv = _child(prop, "sourcevalues")
    if sv is None:
        return ""
    parts = []
    for pv in sorted(_children(sv, "parametervalue"), key=lambda e: e.attrib.get("key", "")):
        vt = pv.attrib.get("valueType", "")
        inner = _children(pv)
        if inner:
            a = _attrs(inner[0])
            detail = ", ".join(f'{k}="{v}"' for k, v in a.items())
        else:
            detail = ""
        parts.append(f"{vt}: {detail}" if detail else vt)
    return " + ".join(parts)


def _property_scope(prop_id: str) -> str:
    return PROPERTY_SCOPES.get(prop_id.split(".", 1)[0], prop_id.split(".", 1)[0] if "." in prop_id else "")


def _properties(cfg: Optional[ET.Element]) -> Tuple[Dict[str, ET.Element], Optional[ET.Element]]:
    """Return ({property key: element}, container) for a Set Properties configuration."""
    if cfg is None:
        return {}, None
    kids = _children(cfg)
    container = kids[0] if kids else None
    props: Dict[str, ET.Element] = {}
    if container is not None:
        for p in _children(container):
            if _local(p.tag).endswith("property"):
                key = p.attrib.get("propertyId") or p.attrib.get("name") or f"#{len(props)}"
                props[key] = p
    return props, container


def _prop_flat(p: ET.Element) -> Flat:
    flat = flatten(p)
    flat["scope"] = _property_scope(p.attrib.get("propertyId", ""))
    summary = _param_summary(p)
    if summary:
        flat["value"] = summary
    return flat


def _cfg_flat(cfg: Optional[ET.Element], skip: Optional[Set[str]] = None) -> Flat:
    return flatten(cfg, skip) if cfg is not None else {}


def _diff_setprops(sid: str, lm: Optional[Dict], rm: Optional[Dict], ch: _Changes) -> None:
    m = rm or lm
    base = dict(shape_id=sid, shape_name=_shape_title(m), shape_type=m["type"], category="setprops", scope="property")
    lprops, lcont = _properties(lm["cfg_el"] if lm else None)
    rprops, rcont = _properties(rm["cfg_el"] if rm else None)

    def non_prop(cont: Optional[ET.Element]) -> Flat:
        return flatten(cont, {_local(p.tag) for p in cont if isinstance(p.tag, str) and _local(p.tag).endswith("property")}) if cont is not None else {}

    for key in sorted(set(lprops) | set(rprops)):
        lp, rp = lprops.get(key), rprops.get(key)
        lf = _prop_flat(lp) if lp is not None else None
        rf = _prop_flat(rp) if rp is not None else None
        label = (rp if rp is not None else lp).attrib.get("name") or key
        if lf is None:
            ch.add(change="added", title=f"Property added: {label}", new=_display_flat(rf), **base)
        elif rf is None:
            ch.add(change="removed", title=f"Property removed: {label}", old=_display_flat(lf), **base)
        else:
            fields = _field_changes(lf, rf)
            ch.add(change="modified" if fields else "unchanged", title=f"Property {'modified' if fields else 'unchanged'}: {label}",
                   old=_display_flat(lf), new=_display_flat(rf), fields=fields, **base)

    fields = _field_changes(non_prop(lcont), non_prop(rcont))
    if fields:
        ch.add(change="modified", title="Set Properties settings modified",
               old=_display_flat(non_prop(lcont)), new=_display_flat(non_prop(rcont)), fields=fields, **{**base, "scope": "shape"})


def _conn_view(c: Dict[str, str], names: Dict[str, str]) -> Dict[str, str]:
    """Connection attributes with the target shape's name next to its id."""
    out = dict(c)
    if c.get("toShape"):
        out["toShape"] = names.get(c["toShape"], c["toShape"])
    return out


def _diff_connections(sid: str, lm: Dict, rm: Dict, ch: _Changes, names: Dict[str, str]) -> None:
    src = _shape_title(rm)
    base = dict(shape_id=sid, shape_name=src, shape_type=rm["type"], category="other", scope="connection")
    target = lambda c: names.get(c.get("toShape", ""), c.get("toShape", "?"))
    for key in sorted(set(lm["conns"]) | set(rm["conns"])):
        lc, rc = lm["conns"].get(key), rm["conns"].get(key)
        if lc is None:
            ch.add(change="added", title=f"Connection added: {src} → {target(rc)}", new=_conn_view(rc, names), **base)
        elif rc is None:
            ch.add(change="removed", title=f"Connection removed: {src} → {target(lc)}", old=_conn_view(lc, names), **base)
        else:
            # Compare raw shape ids so renaming the target shape is not reported as a re-route.
            fields = _field_changes(lc, rc)
            for f in fields:
                if f["field"] == "toShape":
                    f["old"], f["new"] = names.get(f["old"], f["old"]), names.get(f["new"], f["new"])
            lv, rv = _conn_view(lc, names), _conn_view(rc, names)
            if fields:
                ch.add(change="modified", title=f"Connection re-routed: {src} → {target(rc)} (was {target(lc)})",
                       old=lv, new=rv, fields=fields, **base)


def _diff_shape_pair(sid: str, lm: Dict, rm: Dict, ch: _Changes, names: Dict[str, str]) -> None:
    if lm["type"] != rm["type"]:
        ch.add(category="other", change="modified", scope="shape",
               title=f"Shape type changed: {_shape_title(rm)} ({shape_type_label(lm['type'])} → {shape_type_label(rm['type'])})",
               shape_id=sid, shape_name=_shape_title(rm), shape_type=rm["type"],
               old={"shapetype": lm["type"], "label": lm["label"]}, new={"shapetype": rm["type"], "label": rm["label"]},
               fields=[{"field": "shapetype", "old": lm["type"], "new": rm["type"], "masked": False, "positional": False}],
               ambiguous="Shape ID reused with a different shape type; treated as a replacement, configuration not compared.")
        return

    cat = _category(rm["type"])
    if lm["label"] != rm["label"]:
        ch.add(category=cat, change="modified", scope="shape", title=f"Shape renamed: {lm['label'] or sid} → {rm['label'] or sid}",
               shape_id=sid, shape_name=_shape_title(rm), shape_type=rm["type"],
               old={"label": lm["label"]}, new={"label": rm["label"]},
               fields=[{"field": "userlabel", "old": lm["label"], "new": rm["label"], "masked": False, "positional": False}])

    if cat == "setprops":
        _diff_setprops(sid, lm, rm, ch)
    else:
        lf, rf = _cfg_flat(lm["cfg_el"]), _cfg_flat(rm["cfg_el"])
        fields = _field_changes(lf, rf)
        label = _shape_title(rm)
        if fields:
            title = {"map": f"Map shape now uses a different Map: {label}",
                     "connectoraction": f"Connector settings changed: {label}",
                     "connector": f"Connector settings changed: {label}"}.get(rm["type"], f"{shape_type_label(rm['type'])} settings changed: {label}")
            ch.add(category=cat, change="modified", scope="shape", title=title, shape_id=sid, shape_name=label,
                   shape_type=rm["type"], old=_display_flat(lf), new=_display_flat(rf), fields=fields)
        elif ch.include_unchanged:
            ch.add(category=cat, change="unchanged", scope="shape", title=f"Shape unchanged: {label}", shape_id=sid,
                   shape_name=label, shape_type=rm["type"], old=_display_flat(lf), new=_display_flat(rf))
    _diff_connections(sid, lm, rm, ch, names)


def _diff_shape_presence(sid: str, m: Dict, added: bool, ch: _Changes, other_side: List[Dict], names: Dict[str, str]) -> None:
    cat = _category(m["type"])
    label = _shape_title(m)
    cfg = _cfg_flat(m["cfg_el"])
    ambiguous = None
    for o in other_side:
        if o["type"] == m["type"] and o["label"] == m["label"] and _cfg_flat(o["cfg_el"]) == cfg:
            ambiguous = (f"Identical shape also exists as {_shape_title(o)} on the other revision; "
                         "this may be a recreated shape rather than a real add/remove.")
            break
    if cat == "setprops":
        # Present property assignments individually so Set Properties changes stay property-level.
        props, _ = _properties(m["cfg_el"])
        for key, p in sorted(props.items()):
            flat = _display_flat(_prop_flat(p))
            name = p.attrib.get("name") or key
            ch.add(category="setprops", change="added" if added else "removed", scope="property",
                   title=f"Property {'added' if added else 'removed'} (shape {'added' if added else 'removed'}): {name}",
                   shape_id=sid, shape_name=label, shape_type=m["type"],
                   new=flat if added else None, old=None if added else flat, ambiguous=ambiguous)
        if not props:
            ch.add(category="setprops", change="added" if added else "removed", scope="shape",
                   title=f"Set Properties shape {'added' if added else 'removed'}: {label}", shape_id=sid,
                   shape_name=label, shape_type=m["type"], ambiguous=ambiguous)
        return
    entry = {"shapetype": shape_type_label(m["type"]), "label": m["label"], **_display_flat(cfg)}
    entry["connections"] = ", ".join(sorted(names.get(c.get("toShape", ""), c.get("toShape", "?")) for c in m["conns"].values())) or None
    ch.add(category=cat, change="added" if added else "removed", scope="shape",
           title=f"{shape_type_label(m['type'])} shape {'added' if added else 'removed'}: {label}",
           shape_id=sid, shape_name=label, shape_type=m["type"],
           new=entry if added else None, old=None if added else entry, ambiguous=ambiguous)


def diff_process(l: ET.Element, r: ET.Element, ch: _Changes) -> None:
    lproc, rproc = l.find(".//{*}process"), r.find(".//{*}process")
    if lproc is not None and rproc is not None:
        lf, rf = flatten(lproc, {"shapes"}), flatten(rproc, {"shapes"})
        fields = _field_changes(lf, rf)
        if fields:
            ch.add(category="other", change="modified", scope="config", title="Process settings",
                   old=_display_flat(lf), new=_display_flat(rf), fields=fields)

    ls, rs = _shapes(l), _shapes(r)
    names = {"unset": "(not connected)", **{k: _shape_title(m) for k, m in ls.items()}, **{k: _shape_title(m) for k, m in rs.items()}}
    for sid in sorted(set(ls) | set(rs), key=lambda s: (len(s), s)):
        if sid in ls and sid in rs:
            _diff_shape_pair(sid, ls[sid], rs[sid], ch, names)
        elif sid in rs:
            _diff_shape_presence(sid, rs[sid], True, ch, [s for k, s in ls.items() if k not in rs], names)
        else:
            _diff_shape_presence(sid, ls[sid], False, ch, [s for k, s in rs.items() if k not in ls], names)


def map_references(root: ET.Element) -> Dict[str, str]:
    """{shape id: referenced Map component id} for every Map shape in a process."""
    refs = {}
    for sid, m in _shapes(root).items():
        if m["type"] in MAP_SHAPES and m["cfg_el"] is not None:
            el = m["cfg_el"].find("{*}map")
            if el is not None and el.attrib.get("mapId"):
                refs[sid] = el.attrib["mapId"]
    return refs


# --------------------------------------------------------------------------- map components

def _mapping_model(root: ET.Element) -> Dict[str, Dict[str, str]]:
    out: Dict[str, Dict[str, str]] = {}
    for m in root.iter():
        if isinstance(m.tag, str) and _local(m.tag) == "Mapping":
            a = _attrs(m)
            target = a.get("toKeyPath") or a.get("toKey") or a.get("toFunction") or ""
            key = f"{a.get('toType', '')}:{target}"
            n = 1
            while key in out:
                n += 1
                key = f"{a.get('toType', '')}:{target}#{n}"
            out[key] = a
    return out


def _mapping_name(a: Dict[str, str], side: str) -> str:
    return a.get(f"{side}NamePath") or a.get(f"{side}KeyPath") or (f"function {a[side + 'Function']}" if a.get(f"{side}Function") else "") or a.get(f"{side}Key", "?")


def _from_sig(a: Dict[str, str]) -> Tuple[str, ...]:
    return (a.get("fromType", ""), a.get("fromKey", ""), a.get("fromFunction", ""))


def diff_map(l: ET.Element, r: ET.Element, ch: _Changes, source: Optional[Dict[str, str]] = None) -> None:
    lmap = l.find(".//{*}Map") if _local(l.tag) != "Map" else l
    rmap = r.find(".//{*}Map") if _local(r.tag) != "Map" else r
    if lmap is None or rmap is None:
        raise ComparisonError("Map definition not found in one of the component revisions.")
    common = dict(category="map", source=source)

    lf, rf = flatten(lmap, {"Mappings", "Functions"}), flatten(rmap, {"Mappings", "Functions"})
    fields = _field_changes(lf, rf)
    if fields:
        ch.add(change="modified", scope="config", title="Map settings (profiles / defaults)",
               old=_display_flat(lf), new=_display_flat(rf), fields=fields, **common)

    lm, rm = _mapping_model(lmap), _mapping_model(rmap)
    added_keys = [k for k in rm if k not in lm]
    removed_keys = [k for k in lm if k not in rm]
    amb: Dict[str, str] = {}
    for rk in removed_keys:
        sig = _from_sig(lm[rk])
        if not any(sig):
            continue
        for ak in added_keys:
            if _from_sig(rm[ak]) == sig:
                note = "Same source now maps to a different target; this may be a re-target rather than an independent add and remove."
                amb[rk] = amb[ak] = note
    for key in sorted(set(lm) | set(rm)):
        la, ra = lm.get(key), rm.get(key)
        if la is None:
            ch.add(change="added", scope="mapping", title=f"Mapping added: {_mapping_name(ra, 'from')} → {_mapping_name(ra, 'to')}",
                   new=ra, ambiguous=amb.get(key), **common)
        elif ra is None:
            ch.add(change="removed", scope="mapping", title=f"Mapping removed: {_mapping_name(la, 'from')} → {_mapping_name(la, 'to')}",
                   old=la, ambiguous=amb.get(key), **common)
        else:
            fields = _field_changes(la, ra)
            if fields:
                ch.add(change="modified", scope="mapping",
                       title=f"Mapping modified → {_mapping_name(ra, 'to')}: source {_mapping_name(la, 'from')} → {_mapping_name(ra, 'from')}"
                       if any(f["field"].startswith("from") for f in fields) else f"Mapping modified → {_mapping_name(ra, 'to')}",
                       old=la, new=ra, fields=fields, **common)
            elif ch.include_unchanged:
                ch.add(change="unchanged", scope="mapping", title=f"Mapping unchanged: {_mapping_name(ra, 'from')} → {_mapping_name(ra, 'to')}",
                       old=la, new=ra, **common)

    def funcs(m: ET.Element) -> Dict[str, ET.Element]:
        return {f.attrib.get("key") or f"#{i}": f for i, f in enumerate(f for f in m.iter() if isinstance(f.tag, str) and _local(f.tag) == "FunctionStep")}

    lfn, rfn = funcs(lmap), funcs(rmap)
    for key in sorted(set(lfn) | set(rfn), key=lambda k: (len(k), k)):
        a, b = lfn.get(key), rfn.get(key)
        name = (b if b is not None else a).attrib.get("name") or (b if b is not None else a).attrib.get("type", "function")
        if a is None:
            ch.add(change="added", scope="function", title=f"Mapping function added: {name}", new=_display_flat(flatten(b)), **common)
        elif b is None:
            ch.add(change="removed", scope="function", title=f"Mapping function removed: {name}", old=_display_flat(flatten(a)), **common)
        else:
            fa, fb = flatten(a), flatten(b)
            fields = _field_changes(fa, fb)
            if fields:
                ch.add(change="modified", scope="function", title=f"Mapping function modified: {name}",
                       old=_display_flat(fa), new=_display_flat(fb), fields=fields, **common)
            elif ch.include_unchanged:
                ch.add(change="unchanged", scope="function", title=f"Mapping function unchanged: {name}",
                       old=_display_flat(fa), new=_display_flat(fb), **common)


# --------------------------------------------------------------------------- generic + entry point

def diff_generic(l: ET.Element, r: ET.Element, ch: _Changes) -> None:
    lf, rf = flatten(_object(l)), flatten(_object(r))
    for f in _field_changes(lf, rf):
        kind = "added" if f["old"] is None else "removed" if f["new"] is None else "modified"
        ch.add(category="other", change=kind, scope="config", title=f"{f['field']} {kind}",
               old={f["field"]: f["old"]} if f["old"] is not None else None,
               new={f["field"]: f["new"]} if f["new"] is not None else None, fields=[f])


def compare_definitions(left_xml: str, right_xml: str, include_unchanged: bool = False) -> Dict[str, Any]:
    """Compare two definitions of the same component. Map shape references are resolved by the caller."""
    l, r = parse_definition(left_xml), parse_definition(right_xml)
    lk, rk = component_kind(l), component_kind(r)
    ch = _Changes(include_unchanged)
    warnings: List[str] = []
    if lk != rk:
        warnings.append(f"Component type differs between revisions ({lk} vs {rk}); only generic configuration was compared.")
        diff_generic(l, r, ch)
        kind = "generic"
    else:
        kind = lk
        _diff_metadata(l, r, ch, None)
        if kind == "process":
            diff_process(l, r, ch)
        elif kind == "map":
            diff_map(l, r, ch)
        else:
            diff_generic(l, r, ch)
    return {"kind": kind, "changes": ch.items, "warnings": warnings,
            "mapRefs": {"left": map_references(l) if kind == "process" else {}, "right": map_references(r) if kind == "process" else {}}}


def referenced_ids(changes: List[Dict[str, Any]]) -> Set[str]:
    """Every component id (GUID) mentioned in a change's values, e.g. profiles, connections, operations, maps."""
    found: Set[str] = set()

    def scan(v: Any) -> None:
        if isinstance(v, str):
            found.update(m.lower() for m in GUID.findall(v))
        elif isinstance(v, dict):
            for x in v.values():
                scan(x)
        elif isinstance(v, list):
            for x in v:
                scan(x)

    for c in changes:
        scan(c["old"])
        scan(c["new"])
        scan(c["fieldChanges"])
    return found


def compare_maps(left_xml: str, right_xml: str, source: Dict[str, str], include_unchanged: bool, start_index: int) -> List[Dict[str, Any]]:
    """Diff two Map definitions; ids continue from start_index so they stay unique in the combined list."""
    ch = _Changes(include_unchanged)
    diff_map(parse_definition(left_xml), parse_definition(right_xml), ch, source)
    for i, c in enumerate(ch.items):
        c["id"] = f"chg-{start_index + i + 1}"
    return ch.items
