"""Turns Architecture Compiler stages into Boomi process component XML.

Only shapes that need no other component are created for real. Shapes that
need a connection, operation, map or profile component become labeled Message
placeholders, so the canvas keeps the right order and names and the engineer
configures those shapes in Boomi.
"""
import re
from typing import Any, Dict, List, Optional, Tuple
from xml.sax.saxutils import escape, quoteattr

from .boomi_rest_templates import REST_CONNECTION_BODY

REST_SUBTYPE = "officialboomi-X3979C-rest-prod"

START_SHAPES = {
    "Start - No Data", "REST API", "Web Services Server (Listen)", "SAP Enterprise Connector",
    "Salesforce Outbound Messaging", "Database / JDBC", "AWS SQS / S3", "Apache Kafka",
}

X_START, X_STEP, Y, DRAG_DX = 48, 240, 48, 176


def _stage_dict(stage: Any) -> Dict[str, Any]:
    if isinstance(stage, dict):
        return stage
    if hasattr(stage, "model_dump"):
        return stage.model_dump()
    return stage.dict()


def parse_call(notes: str, label: str) -> Tuple[str, str]:
    """Reads 'GET AccountUserRole' / 'QUERY Environment' from the notes into (method, path)."""
    m = re.search(r"(?<![A-Za-z])(GET|POST|PUT|DELETE|QUERY)(?![A-Za-z])\s+/?([A-Za-z][\w/.-]*)", notes or "", re.I)
    if not m:
        return "GET", "/" + (re.sub(r"[^A-Za-z0-9]+", "", label) or "resource")
    verb, obj = m.group(1).upper(), m.group(2).strip("/.")
    if verb == "QUERY":
        return "POST", f"/{obj}/query"
    return verb, f"/{obj}"


def parse_properties(notes: str) -> List[Tuple[str, Optional[str]]]:
    """DDP names in the notes. 'DDP_X = "v"' or 'DDP_X to "v"' is static; otherwise the current document."""
    found: List[Tuple[str, Optional[str]]] = []
    for m in re.finditer(r"(?<!\w)(DDP_\w+)(?:\s*(?:=|to)\s*(?:\"([^\"]*)\"|'([^']*)'))?", notes or ""):
        name = m.group(1)
        if any(name == n for n, _ in found):
            continue
        static = m.group(2) if m.group(2) is not None else m.group(3)
        found.append((name, static))
    return found


_BASE64_GROOVY = """import java.util.Properties;
import java.io.InputStream;
import java.io.ByteArrayInputStream;

for (int i = 0; i < dataContext.getDataCount(); i++) {
    InputStream is = dataContext.getStream(i);
    Properties props = dataContext.getProperties(i);
    byte[] data = is.getBytes();
    String result = %s;
    dataContext.storeStream(new ByteArrayInputStream(result.getBytes("UTF-8")), props);
}
"""


def base64_script(notes: str) -> Optional[str]:
    """Groovy for a Base64 encode/decode Data Process step, or None for anything else."""
    low = (notes or "").lower()
    if "base64" not in low and "base 64" not in low:
        return None
    if "decode" in low:
        return _BASE64_GROOVY % 'new String(java.util.Base64.getDecoder().decode(data), "UTF-8")'
    return _BASE64_GROOVY % "java.util.Base64.getEncoder().encodeToString(data)"


def plan_shapes(stages: list) -> List[Dict[str, Any]]:
    """Ordered shape plan: label, Boomi shapetype, whether it is a placeholder and why."""
    plan: List[Dict[str, Any]] = []
    stage_dicts = [_stage_dict(s) for s in stages]
    if not stage_dicts or stage_dicts[0].get("selectedShapeOrConnector") not in START_SHAPES:
        plan.append({"label": "Start", "kind": "start", "placeholder": False, "reason": "", "text": ""})

    for i, st in enumerate(stage_dicts):
        shape = st.get("selectedShapeOrConnector", "")
        label = (st.get("label") or shape).strip()
        notes = (st.get("notes") or "").strip()
        entry: Dict[str, Any] = {"label": label, "kind": "", "placeholder": False, "reason": "", "text": notes}

        if shape in START_SHAPES and i == 0:
            entry["kind"] = "start"
            if shape != "Start - No Data":
                entry["placeholder"] = True
                entry["reason"] = f"{shape} start needs a connection and operation; created as a No Data start."
        elif shape == "Message":
            entry["kind"] = "message"
            entry["text"] = notes or label
        elif shape == "Notify":
            entry["kind"] = "notify"
            entry["text"] = notes or label
        elif shape == "Boomi Platform API":
            method, path = parse_call(notes, label)
            entry["kind"] = "connectoraction"
            entry["method"], entry["path"] = method, path
            entry["call"] = f"{method} {path}"
        elif shape == "Stop":
            entry["kind"] = "stop"
        elif shape == "Return Documents":
            entry["kind"] = "returndocuments"
        elif shape == "Set Properties":
            entry["kind"] = "documentproperties"
            entry["properties"] = parse_properties(notes)
            if not entry["properties"]:
                entry["configure"] = True
                entry["reason"] = "No DDP_ name found in the notes (for example 'Set DDP_AuthHeader'); configure the properties in Boomi."
        elif shape == "Data Process (Split/Combine)":
            entry["kind"] = "dataprocess"
            entry["script"] = base64_script(notes)
            if not entry["script"]:
                entry["configure"] = True
                entry["reason"] = "Only Base64 encode/decode is generated from the notes; add the processing step in Boomi."
        else:
            entry["kind"] = "message"
            entry["placeholder"] = True
            entry["text"] = f"TODO configure {shape}: {notes}" if notes else f"TODO configure {shape}"
            entry["reason"] = f"{shape} needs its own component (connection, operation, map or rule); added as a labeled placeholder."
        plan.append(entry)
    return plan


def _config(entry: Dict[str, Any]) -> str:
    kind = entry["kind"]
    text = escape(entry.get("text", ""))
    if kind == "start":
        return "<noaction/>"
    if kind == "message":
        return f'<message combined="false"><msgTxt>{text}</msgTxt><msgParameters/></message>'
    if kind == "notify":
        return (
            '<notify disableEvent="true" enableUserLog="false" perExecution="false" title="">'
            f"<notifyMessage>{text}</notifyMessage><notifyMessageLevel>INFO</notifyMessageLevel>"
            "<notifyParameters/></notify>"
        )
    if kind == "connectoraction":
        return (
            f'<connectoraction actionType="{entry["method"]}" allowDynamicCredentials="NONE" '
            f'connectionId="{entry["connectionId"]}" connectorType="{REST_SUBTYPE}" hideSettings="false" '
            f'operationId="{entry["operationId"]}"><parameters/><dynamicProperties/></connectoraction>'
        )
    if kind == "stop":
        return '<stop continue="true"/>'
    if kind == "returndocuments":
        return "<returndocuments/>"
    if kind == "documentproperties":
        props = entry.get("properties") or []
        if not props:
            return "<documentproperties/>"
        items = []
        for key, (name, static) in enumerate(props, start=1):
            if static is None:
                source = f'<parametervalue key="{key}" usesEncryption="false" valueType="current"/>'
            else:
                source = (
                    f'<parametervalue key="{key}" usesEncryption="false" valueType="static">'
                    f"<staticparameter staticproperty={quoteattr(static)}/></parametervalue>"
                )
            items.append(
                '<documentproperty defaultValue="" isDynamicCredential="false" isTradingPartner="false" '
                f'name="Dynamic Document Property - {name}" persist="false" propertyId="dynamicdocument.{name}" '
                f'shouldEncrypt="false"><sourcevalues>{source}</sourcevalues></documentproperty>'
            )
        return f"<documentproperties>{''.join(items)}</documentproperties>"
    if kind == "dataprocess":
        script = entry.get("script")
        if not script:
            return "<dataprocess/>"
        return (
            '<dataprocess><step index="1" key="1" name="Custom Scripting" processtype="12">'
            f'<dataprocessscript language="groovy2" useCache="true"><script>{escape(script)}</script>'
            "</dataprocessscript></step></dataprocess>"
        )
    return "<noaction/>"


_IMAGES = {
    "start": "start",
    "message": "message_icon",
    "notify": "notify_icon",
    "stop": "stop_icon",
    "returndocuments": "returndocuments_icon",
    "documentproperties": "documentproperties_icon",
    "dataprocess": "dataprocess_icon",
    "connectoraction": "connectoraction_icon",
}


def build_process_xml(name: str, description: str, folder_id: str, plan: List[Dict[str, Any]]) -> str:
    shapes = []
    for i, entry in enumerate(plan):
        n = i + 1
        x = X_START + X_STEP * i
        kind = entry["kind"]
        shapetype = "start" if kind == "start" else kind
        if i < len(plan) - 1:
            dragpoints = f'<dragpoints><dragpoint name="shape{n}.dragpoint1" toShape="shape{n + 1}" x="{x + DRAG_DX}.0" y="{Y + 8}.0"/></dragpoints>'
        else:
            dragpoints = "<dragpoints/>"
        shapes.append(
            f'<shape image="{_IMAGES.get(kind, "message_icon")}" name="shape{n}" shapetype="{shapetype}" '
            f'userlabel={quoteattr(entry["label"])} x="{x}.0" y="{Y}.0">'
            f"<configuration>{_config(entry)}</configuration>{dragpoints}</shape>"
        )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<bns:Component xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:bns="http://api.platform.boomi.com/" '
        f'folderId={quoteattr(folder_id)} name={quoteattr(name)} type="process">\n'
        f"  <bns:description>{escape(description)}</bns:description>\n"
        "  <bns:object>\n"
        '    <process xmlns="" allowSimultaneous="false" enableUserLog="false" processLogOnErrorOnly="false" '
        'purgeDataImmediately="false" stopProcessingIfZeroDocuments="false" updateRunDates="true" workload="general">\n'
        f"      <shapes>{''.join(shapes)}</shapes>\n"
        "    </process>\n"
        "  </bns:object>\n"
        "</bns:Component>"
    )


def safe_process_name(name: str) -> str:
    cleaned = "".join(c if c.isalnum() or c in "-_ ." else "_" for c in name).strip()
    return cleaned or "Blueprint_Process"


def _component_xml(name: str, description: str, folder_id: str, ctype: str, body: str) -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<bns:Component xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:bns="http://api.platform.boomi.com/" '
        f'folderId={quoteattr(folder_id)} name={quoteattr(name)} type="{ctype}" subType="{REST_SUBTYPE}">'
        f"<bns:description>{escape(description)}</bns:description><bns:object>{body}</bns:object></bns:Component>"
    )


def build_rest_connection_xml(name: str, description: str, folder_id: str, url: str) -> str:
    """REST Client connection with Basic auth and blank credentials; the engineer enters them in Boomi."""
    body = REST_CONNECTION_BODY.replace("@@URL@@", escape(url, {'"': "&quot;"})).replace("@@AUTH@@", "BASIC")
    return _component_xml(name, description, folder_id, "connector-settings", body)


def build_rest_operation_xml(name: str, description: str, folder_id: str, method: str, path: str) -> str:
    headers = '<properties key="Accept" value="application/json"/>'
    if method in ("POST", "PUT"):
        headers += '<properties key="Content-Type" value="application/json"/>'
    body = (
        '<Operation xmlns="" returnApplicationErrors="false" trackResponse="false">'
        '<Archiving directory="" enabled="false"/><Configuration>'
        f'<GenericOperationConfig customOperationType="{method}" operationType="EXECUTE">'
        '<field id="followRedirects" type="string" value="NONE"/>'
        f'<field id="path" type="string" value={quoteattr(path)}/>'
        '<field id="queryParameters" type="customproperties"><customProperties/></field>'
        f'<field id="requestHeaders" type="customproperties"><customProperties>{headers}</customProperties></field>'
        "<Options/></GenericOperationConfig></Configuration>"
        "<Tracking><TrackedFields/></Tracking><Caching/></Operation>"
    )
    return _component_xml(name, description, folder_id, "connector-action", body)
