"""Turns Architecture Compiler stages into Boomi process component XML.

Shapes are created as real Boomi steps. Map and connector steps that still need
their map, connection or operation are left unconfigured, so Boomi shows
"Configure" on them and the engineer completes them there. Shapes Boomi has no
step for become labeled Message placeholders, so the canvas keeps its order and names.
"""
import re
from typing import Any, Dict, List, Optional, Tuple
from xml.sax.saxutils import escape, quoteattr

from .boomi_rest_templates import REST_CONNECTION_BODY

REST_SUBTYPE = "officialboomi-X3979C-rest-prod"

# Start shapes from ArchForge's catalog (src/services/shapeCatalog.ts START_SHAPES); keep both in sync.
START_SHAPE_IDS = [
    "Start - No Data", "REST API", "Web Services Server (Listen)", "SAP Enterprise Connector",
    "Salesforce Outbound Messaging", "Database / JDBC", "AWS SQS / S3", "Apache Kafka",
    # Listener connectors
    "Boomi Event Streams", "Flow Services Server", "AS2 Shared Server", "MLLP Server", "Atom Queue", "JMS",
    "IBM MQ", "RabbitMQ", "Solace PubSub+", "MQTT", "Amazon SQS", "Amazon EventBridge", "Azure Service Bus",
    "Google Cloud Pub/Sub", "Salesforce Platform Events", "Disk v2 (Listen)",
]
START_SHAPES = set(START_SHAPE_IDS)

# Connector shapes from ArchForge's catalog (src/services/shapeCatalog.ts CONNECTOR_SHAPES); keep both in sync.
CONNECTOR_SHAPE_IDS = [
    "Connector", "Boomi Platform API", "HTTP Client", "Salesforce", "NetSuite SuiteTalk", "SAP ERP",
    "PostgreSQL Database", "AWS S3 Data Lake", "ServiceNow",
    "Database (JDBC)", "Database (Legacy)", "Microsoft Azure SQL Database", "Oracle Database", "Microsoft SQL Server",
    "MySQL", "Snowflake", "Google BigQuery", "MongoDB", "Disk V2", "FTP", "SFTP", "Amazon S3", "Azure Blob Storage",
    "Box", "SOAP Client", "Mail", "Kafka (Produce)", "JMS (Send)", "Boomi Event Streams (Produce)",
    "Atom Queue (Send)", "Slack", "Workday", "Microsoft Dynamics 365", "SAP SuccessFactors",
    "Oracle E-Business Suite", "Shopify",
]

# Execute / Logic steps built as real Boomi steps (catalog id -> Boomi shapetype)
LOGIC_KINDS = {
    "Decision & Route Shapes": "decision",
    "Route": "route",
    "Try/Catch & Set Properties": "catcherrors",
    "Exception": "exception",
    "Flow Control": "flowcontrol",
    "Add to Cache": "doccacheload",
    "Retrieve From Cache": "doccacheretrieve",
    "Remove From Cache": "doccacheremove",
    "Agent": "agent",
}
CONFIGURE_HINTS = {
    "decision": "True continues the flow and False ends at a Stop; set the comparison in Boomi.",
    "route": "Documents continue on Default; add the route values in Boomi.",
    "doccacheload": "Choose the document cache in Boomi. Add to Cache consumes documents, so it ends the path.",
    "doccacheretrieve": "Choose the document cache in Boomi.",
    "doccacheremove": "Choose the document cache in Boomi. Remove From Cache ends the path.",
    "agent": "Choose the agent connection and operation in Boomi.",
}

# Connectors built with their own connection and operation (credentials left blank to enter in Boomi).
# Database family: JDBC URL template and driver class per database.
DATABASE_DRIVERS = {
    "Database (JDBC)": ("jdbc:mysql://host:3306/database", "com.mysql.jdbc.Driver"),
    "MySQL": ("jdbc:mysql://host:3306/database", "com.mysql.jdbc.Driver"),
    "PostgreSQL Database": ("jdbc:postgresql://host:5432/database", "org.postgresql.Driver"),
    "Oracle Database": ("jdbc:oracle:thin:@host:1521:SID", "oracle.jdbc.driver.OracleDriver"),
    "Microsoft SQL Server": ("jdbc:sqlserver://host:1433;databaseName=database", "com.microsoft.sqlserver.jdbc.SQLServerDriver"),
    "Microsoft Azure SQL Database": ("jdbc:sqlserver://server.database.windows.net:1433;databaseName=database",
                                     "com.microsoft.sqlserver.jdbc.SQLServerDriver"),
}
CONNECTOR_FAMILIES = {**{shape: "database" for shape in DATABASE_DRIVERS}, "Disk V2": "disk", "HTTP Client": "http"}

# Boomi connector type per catalog shape, where it is known. Relational databases use the Database
# connector; anything else is left as a generic connector step whose type is chosen in Boomi.
DATABASE_V2 = "officialboomi-X3979C-dbv2da-prod"
CONNECTOR_TYPES = {
    "Database (JDBC)": DATABASE_V2, "PostgreSQL Database": DATABASE_V2, "Oracle Database": DATABASE_V2,
    "Microsoft SQL Server": DATABASE_V2, "MySQL": DATABASE_V2, "Microsoft Azure SQL Database": DATABASE_V2,
    "Database (Legacy)": "database",
    "HTTP Client": REST_SUBTYPE,
    "Salesforce": "salesforce",
    "Disk V2": "disk-sdk",
    "Mail": "mailsdk",
    "Boomi Event Streams (Produce)": "officialboomi-X3979C-events-prod",
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
        plan.append(_plan_entry(st, i == 0))
    return plan


def iter_entries(plan: List[Dict[str, Any]]):
    """Every entry in the plan, including the shapes on branch paths."""
    for entry in plan:
        yield entry
        for path in entry.get("paths") or []:
            yield from iter_entries(path)
        yield from iter_entries(entry.get("steps") or [])


def _plan_entry(st: Dict[str, Any], first: bool) -> Dict[str, Any]:
    shape = st.get("selectedShapeOrConnector", "")
    label = (st.get("label") or shape).strip()
    notes = (st.get("notes") or "").strip()
    entry: Dict[str, Any] = {"label": label, "kind": "", "placeholder": False, "reason": "", "text": notes, "shape": shape}

    if shape in START_SHAPES and first:
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
    elif shape == "Process Call":
        entry["kind"] = "processcall"
        # Steps inside the sub-process (no nested calls or branches). It ends at Return Documents unless the
        # steps end it themselves; anything after an end shape is dropped.
        steps: List[Dict[str, Any]] = []
        for x in map(_stage_dict, st.get("subprocessSteps") or []):
            if x.get("selectedShapeOrConnector") in ("Branch", "Process Call"):
                continue
            steps.append(_plan_entry(x, False))
            if steps[-1]["kind"] in END_KINDS:
                break
        entry["steps"] = steps
        # A sub-process that ends at Stop returns nothing, so the main flow does not continue after the call
        entry["returns"] = not (steps and steps[-1]["kind"] in END_KINDS and steps[-1]["kind"] != "returndocuments")
        entry["reason"] = ("A sub-process is created with it (Data Passthrough start, its steps, Return Documents) and linked."
                           if entry["returns"] else
                           f"A sub-process is created with it and linked. It ends at {steps[-1]['label'] or 'Stop'}, so nothing returns and the "
                           "steps after this Process Call are left unconnected.")
    elif shape == "Process Route":
        entry["kind"] = "processroute"
        entry["configure"] = True
        entry["reason"] = "Create a Process Route component, select it here and set the route key in Boomi."
    elif shape == "Branch":
        entry["kind"] = "branch"
        entry["branches"] = max(MIN_BRANCHES, min(MAX_BRANCHES, int(st.get("branches") or MIN_BRANCHES)))
        # Paths 2..N carry their own shapes (no nested branches); path 1 is the main flow
        saved = st.get("branchPaths") or []
        entry["paths"] = [
            [_plan_entry(_stage_dict(x), False) for x in (saved[b] if b < len(saved) else [])
             if _stage_dict(x).get("selectedShapeOrConnector") != "Branch"]
            for b in range(entry["branches"] - 1)
        ]
        entry["reason"] = f"Branch 1 continues the flow; branches 2-{entry['branches']} run their own shapes and end at a Stop."
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
    elif shape in LOGIC_KINDS:
        entry["kind"] = LOGIC_KINDS[shape]
        if entry["kind"] in ("decision", "route", "doccacheload", "doccacheretrieve", "doccacheremove", "agent"):
            entry["configure"] = True
            entry["reason"] = CONFIGURE_HINTS[entry["kind"]]
        elif entry["kind"] == "catcherrors":
            entry["reason"] = "Try continues the flow; Catch ends at a Stop for you to handle the error in Boomi."
    elif shape == "Map & transform":
        entry["kind"] = "map"
        entry["reason"] = ("A map with empty source and target JSON profiles is created and linked; "
                           "add the fields and mappings in Boomi.")
    elif shape in CONNECTOR_FAMILIES:
        entry["kind"] = "connector"
        entry["connectorType"] = CONNECTOR_TYPES.get(shape, "")
        entry["family"] = CONNECTOR_FAMILIES[shape]
        if entry["family"] == "database":
            # SQL from the notes when it looks like a query; otherwise a placeholder query to edit in Boomi
            entry["actionType"] = "GET"
            entry["sql"] = notes if re.match(r"(?is)\s*(select|with)\b", notes) else "SELECT 1"
            entry["reason"] = ("A Database connection (blank username and password) and a Standard Get operation are "
                               "created and linked; enter the URL and credentials and adjust the query in Boomi.")
        elif entry["family"] == "disk":
            entry["actionType"] = "CREATE"
            entry["reason"] = ("A Disk V2 connection (directory 'work') and a Create operation are created and linked; "
                               "set connector.disk-sdk.fileName with a Set Properties step before it.")
        else:
            url = re.search(r"https?://[^\s'\"]+", notes)
            entry["url"] = url.group(0) if url else "https://example.com"
            entry["actionType"], entry["path"] = parse_call(notes.replace(entry["url"], "") if url else notes, label)
            entry["reason"] = (f"A REST connection to {entry['url']} (blank credentials) and a {entry['actionType']} "
                               f"{entry['path']} operation are created and linked; adjust them in Boomi.")
    elif shape in CONNECTOR_SHAPE_IDS:
        entry["kind"] = "connector"
        entry["connectorType"] = CONNECTOR_TYPES.get(shape, "")
        entry["configure"] = True
        entry["reason"] = (f"Choose the {shape} connection and operation in Boomi." if entry["connectorType"]
                           else f"Choose the connector type for {shape}, then its connection and operation, in Boomi.")
    else:
        entry["kind"] = "message"
        entry["placeholder"] = True
        entry["text"] = f"TODO configure {shape}: {notes}" if notes else f"TODO configure {shape}"
        entry["reason"] = f"{shape} needs its own component (connection, operation, map or rule); added as a labeled placeholder."
    return entry


def _config(entry: Dict[str, Any]) -> str:
    kind = entry["kind"]
    text = escape(entry.get("text", ""))
    if kind == "start":
        return "<passthroughaction/>" if entry.get("passthrough") else "<noaction/>"
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
    if kind == "processcall":
        # Linked to the generated sub-process; its Return Documents shape is the return path.
        # Without a sub-process Boomi shows "Configure"; the schema requires <returnpaths> even when empty.
        process_id = entry.get("processId", "")
        paths = f'<returnpaths childShapeName="{SUB_RETURN_SHAPE}"/>' if process_id and entry.get("returns", True) else ""
        return (
            f'<processcall abort="true" processId={quoteattr(process_id)} wait="true">'
            f"<parameters/><returnpaths>{paths}</returnpaths></processcall>"
        )
    if kind == "processroute":
        # No Process Route component yet; documents leave on the always-present Default path
        return (
            '<processroutecall abort="true" processRouteId="" processRouteName="" routeType="processroute" wait="true">'
            '<returnpaths/><routeParameter key="0" usesEncryption="false" valueType="current"/></processroutecall>'
        )
    if kind == "branch":
        return f'<branch numBranches="{entry["branches"]}"/>'
    if kind == "decision":
        # Two blank values to compare; Boomi shows the comparison to fill in
        blank = '<decisionvalue valueType="static"><staticparameter staticproperty=""/></decisionvalue>'
        return f'<decision comparison="equals" name={quoteattr(entry["label"])}>{blank}{blank}</decision>'
    if kind == "route":
        return ('<route><routeproperty valueType="track"><trackparameter defaultValue="" propertyId="" propertyName=""/>'
                '</routeproperty><routevalues/></route>')
    if kind == "catcherrors":
        return '<catcherrors catchAll="true" retryCount="0"/>'
    if kind == "exception":
        return (f'<exception stopProcessReturnSingleDoc="false" stopsingledoc="true" title={quoteattr(entry["label"])}>'
                f"<exMessage>{text or escape(entry['label'])}</exMessage><exParameters/></exception>")
    if kind == "flowcontrol":
        return '<flowcontrol chunkStyle="threadOnly" chunks="0" forEachCount="0"/>'
    if kind == "doccacheload":
        return '<doccacheload docCache=""/>'
    if kind == "doccacheretrieve":
        return '<doccacheretrieve docCache="" emptyCacheBehavior="stopprocess" loadAllDoc="true"><cacheKeyValues/></doccacheretrieve>'
    if kind == "doccacheremove":
        return '<doccacheremove allIndices="true" docCache="" removeAllDocuments="true"><cacheKeyValues/></doccacheremove>'
    if kind == "agent":
        return ('<connectoraction actionType="" allowDynamicCredentials="NONE" connectorType="boomiai" hideSettings="false">'
                "<parameters/><dynamicProperties/></connectoraction>")
    if kind == "map":
        # The map created for this step; without one Boomi shows "Configure"
        return f'<map mapId={quoteattr(entry.get("mapId", ""))}/>'
    if kind == "connector":
        # Linked to the generated connection and operation; without them Boomi shows "Configure" on the step
        linked_ids = ""
        if entry.get("connectionId"):
            linked_ids = f' connectionId="{entry["connectionId"]}" operationId="{entry["operationId"]}"'
            if entry.get("requestProfileId"):
                linked_ids += f' parameter-profile="{entry["requestProfileId"]}"'
        return (
            f'<connectoraction actionType={quoteattr(entry.get("actionType", "") if linked_ids else "")} '
            f'allowDynamicCredentials="NONE" connectorType={quoteattr(entry["connectorType"])} hideSettings="false"'
            f"{linked_ids}><parameters/><dynamicProperties/></connectoraction>"
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
    "processcall": "processcall_icon",
    "processroute": "processroute_icon",
    "branch": "branch_icon",
    "map": "map_icon",
    "connector": "connectoraction_icon",
    "decision": "decision_icon",
    "route": "route_icon",
    "catcherrors": "catcherrors_icon",
    "exception": "exception_icon",
    "flowcontrol": "flowcontrol_icon",
    "doccacheload": "doccacheload_icon",
    "doccacheretrieve": "doccacheretrieve_icon",
    "doccacheremove": "doccacheremove_icon",
    "agent": "aiagent_icon",
}
_SHAPETYPES = {"connector": "connectoraction", "agent": "connectoraction"}

# Steps with a second way out: the first continues the flow, this one ends at its own Stop below
_ALT_PATH = {"decision": ("false", "False"), "catcherrors": ("error", "Catch")}
# Dragpoint that continues the flow, when the step names its outputs
_MAIN_PATH = {"decision": ("true", "True"), "catcherrors": ("default", "Try")}

# Boomi's Branch step takes 2 to 25 paths
MIN_BRANCHES, MAX_BRANCHES = 2, 25
BRANCH_DY = 96  # vertical gap between branch paths on the canvas

# Shapes whose XML Boomi may refuse while they reference nothing; on refusal they are rebuilt as placeholders.
UNREFERENCED_KINDS = {"processcall", "processroute", "map", "connector", "decision", "route",
                      "doccacheload", "doccacheretrieve", "doccacheremove", "agent"}


def linked(entry: Dict[str, Any]) -> bool:
    """True once the step points at a component created for it (a sub-process or a map)."""
    return bool(entry.get("processId") or entry.get("mapId") or entry.get("connectionId"))


def as_placeholders(plan: List[Dict[str, Any]], kinds: set) -> List[Dict[str, Any]]:
    """Copy of the plan with the given kinds turned into labeled Message placeholders."""
    out = []
    for entry in plan:
        if entry["kind"] in kinds and not linked(entry):
            name = entry.get("shape") or entry["kind"]
            entry = {**entry, "kind": "message", "placeholder": True,
                     "text": f"TODO configure {name}: {entry.get('text') or entry['label']}",
                     "reason": f"Boomi did not accept an unconfigured {name}; added as a labeled placeholder."}
        elif entry.get("paths"):
            entry = {**entry, "paths": [as_placeholders(path, kinds) for path in entry["paths"]]}
        out.append(entry)
    return out


# Sub-process created for each Process Call: Data Passthrough start -> its steps -> Return Documents.
# The parent's return path names the Return Documents shape, so its name is fixed here.
SUB_RETURN_SHAPE = "shape2"
END_KINDS = ("stop", "returndocuments", "exception", "doccacheload", "doccacheremove")


def build_subprocess_xml(name: str, description: str, folder_id: str, steps: List[Dict[str, Any]], text: str = "") -> str:
    """Sub-process that receives the caller's documents, runs its steps and returns them on one path."""
    steps = steps or [{"label": "Sub-process logic", "kind": "message", "text": text}]
    start = {"label": "", "kind": "start", "text": "", "passthrough": True}
    body = [start] + list(steps)
    if body[-1]["kind"] not in END_KINDS:
        body.append({"label": "", "kind": "returndocuments", "text": ""})
    # The Return Documents shape keeps the fixed name the parent's return path points at
    names = ["shape1"] + [f"shape{k + 3}" for k in range(len(body) - 2)]
    names.append(SUB_RETURN_SHAPE if body[-1]["kind"] == "returndocuments" else f"shape{len(body) + 1}")
    canvas = _Canvas(len(body) + 2)
    _chain(canvas, body, names, X_START, Y)
    return _process_component(name, description, folder_id, "".join(canvas.shapes))


class _Canvas:
    """Collects shapes and hands out free shape names and free rows below the main row."""

    def __init__(self, first_free: int):
        self.shapes: List[str] = []
        self.free = first_free
        self.row = 0

    def name(self) -> str:
        self.free += 1
        return f"shape{self.free - 1}"

    def new_row(self) -> int:
        self.row += 1
        return Y + BRANCH_DY * self.row


_STOP = {"label": "", "kind": "stop", "text": ""}


def _chain(canvas: "_Canvas", entries: List[Dict[str, Any]], names: List[str], x0: int, y: int) -> None:
    """Lays out entries left to right on row y, linking each to the next while documents continue."""
    for k, entry in enumerate(entries):
        x = x0 + X_STEP * k
        nxt = names[k + 1] if k + 1 < len(entries) and _continues(entry) else None
        points: List[Tuple[str, str, int]] = []  # (identifier/text attributes, target shape, y)
        if entry["kind"] == "branch":
            # Branch 1 continues the flow; every other branch runs its own shapes on a new row
            if nxt:
                points.append((' identifier="1" text="1"', nxt, y))
            for b, path in enumerate(entry["paths"], start=2):
                steps = list(path)
                if not steps or steps[-1]["kind"] not in END_KINDS:
                    steps.append(dict(_STOP))
                row = canvas.new_row()
                path_names = [canvas.name() for _ in steps]
                points.append((f' identifier="{b}" text="{b}"', path_names[0], row))
                _chain(canvas, steps, path_names, x + X_STEP, row)
        else:
            if nxt:
                points.append((_link(entry), nxt, y))
            if entry["kind"] in _ALT_PATH:
                ident, text = _ALT_PATH[entry["kind"]]
                row = canvas.new_row()
                stop = canvas.name()
                points.append((f' identifier="{ident}" text="{text}"', stop, row))
                canvas.shapes.append(_shape(dict(_STOP), stop, x + X_STEP, row, "<dragpoints/>"))
        dragpoints = "".join(
            f'<dragpoint{attrs} name="{names[k]}.dragpoint{i}" toShape="{target}" x="{x + DRAG_DX}.0" y="{py + 8}.0"/>'
            for i, (attrs, target, py) in enumerate(points, start=1)
        )
        canvas.shapes.append(_shape(entry, names[k], x, y, f"<dragpoints>{dragpoints}</dragpoints>" if dragpoints else "<dragpoints/>"))


def _process_component(name: str, description: str, folder_id: str, shapes: str) -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<bns:Component xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:bns="http://api.platform.boomi.com/" '
        f'folderId={quoteattr(folder_id)} name={quoteattr(name)} type="process">\n'
        f"  <bns:description>{escape(description)}</bns:description>\n"
        "  <bns:object>\n"
        '    <process xmlns="" allowSimultaneous="false" enableUserLog="false" processLogOnErrorOnly="false" '
        'purgeDataImmediately="false" stopProcessingIfZeroDocuments="false" updateRunDates="true" workload="general">\n'
        f"      <shapes>{shapes}</shapes>\n"
        "    </process>\n"
        "  </bns:object>\n"
        "</bns:Component>"
    )


def _link(entry: Dict[str, Any]) -> str:
    """Identifier on the dragpoint that leaves a shape towards the next one."""
    if entry["kind"] == "processroute":
        return ' identifier="default" text="Default"'  # continues on Default until return paths are configured
    if entry["kind"] == "processcall" and entry.get("processId") and entry.get("returns", True):
        return f' identifier="{SUB_RETURN_SHAPE}"'  # documents returned by the sub-process continue here
    if entry["kind"] in _MAIN_PATH:
        ident, text = _MAIN_PATH[entry["kind"]]
        return f' identifier="{ident}" text="{text}"'
    return ""


def _continues(entry: Dict[str, Any]) -> bool:
    """False when nothing comes out of the step: an end step, or a Process Call whose sub-process returns nothing."""
    if entry["kind"] in END_KINDS:
        return False
    return not (entry["kind"] == "processcall" and entry.get("processId") and not entry.get("returns", True))


def _shape(entry: Dict[str, Any], name: str, x: int, y: int, dragpoints: str) -> str:
    kind = entry["kind"]
    # Boomi already captions a Stop "End and continue"; repeating it as the label shows it twice
    label = "" if kind == "stop" and entry["label"] in ("Stop", "End and continue") else entry["label"]
    return (
        f'<shape image="{_IMAGES.get(kind, "message_icon")}" name="{name}" shapetype="{_SHAPETYPES.get(kind, kind)}" '
        f'userlabel={quoteattr(label)} x="{x}.0" y="{y}.0">'
        f"<configuration>{_config(entry)}</configuration>{dragpoints}</shape>"
    )


def build_process_xml(name: str, description: str, folder_id: str, plan: List[Dict[str, Any]]) -> str:
    canvas = _Canvas(len(plan) + 1)
    _chain(canvas, plan, [f"shape{i + 1}" for i in range(len(plan))], X_START, Y)
    return _process_component(name, description, folder_id, "".join(canvas.shapes))


def safe_process_name(name: str) -> str:
    cleaned = "".join(c if c.isalnum() or c in "-_ ." else "_" for c in name).strip()
    return cleaned or "Blueprint_Process"


def _component_xml(name: str, description: str, folder_id: str, ctype: str, body: str, subtype: str = REST_SUBTYPE) -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<bns:Component xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:bns="http://api.platform.boomi.com/" '
        f'folderId={quoteattr(folder_id)} name={quoteattr(name)} type="{ctype}" subType="{subtype}">'
        f"<bns:description>{escape(description)}</bns:description>"
        # REST components are created as before; the other connectors' templates carry an empty encryptedValues
        f"{'' if subtype == REST_SUBTYPE else '<bns:encryptedValues/>'}<bns:object>{body}</bns:object></bns:Component>"
    )


def build_database_connection_xml(name: str, description: str, folder_id: str, shape: str) -> str:
    """Database V2 connection with a template JDBC URL and blank credentials; the engineer completes it in Boomi."""
    url, driver = DATABASE_DRIVERS[shape]
    body = (
        "<GenericConnectionConfig>"
        f'<field id="url" type="string" value={quoteattr(url)}/>'
        f'<field id="className" type="string" value={quoteattr(driver)}/>'
        '<field id="username" type="string" value=""/>'
        '<field id="password" type="password" value=""/>'
        '<field id="CustomProperties" type="customproperties"><customProperties/></field>'
        '<field id="schemaName" type="string" value=""/>'
        '<field id="connectTimeOut" type="integer"/><field id="readTimeOut" type="integer"/>'
        '<field id="enablePooling" type="boolean" value="false"/>'
        "</GenericConnectionConfig>"
    )
    return _component_xml(name, description, folder_id, "connector-settings", body, DATABASE_V2)


def build_database_operation_xml(name: str, description: str, folder_id: str, sql: str,
                                 request_profile: str, response_profile: str) -> str:
    """Database V2 Standard Get running the given SQL; schemaName must be present or the Get returns no rows."""
    body = (
        '<Operation returnApplicationErrors="true" trackResponse="false"><Archiving directory="" enabled="false"/><Configuration>'
        f'<GenericOperationConfig customOperationType="GET" objectTypeId="" operationType="EXECUTE" '
        f'requestProfile="{request_profile}" requestProfileType="json" responseProfile="{response_profile}" responseProfileType="json">'
        '<field id="GetType" type="string" value="Standard Get"/>'
        '<field id="INClause" type="boolean" value="false"/>'
        '<field id="schemaName" type="string" value=""/>'
        f'<field id="query" type="string" value={quoteattr(sql)}/>'
        '<field id="linkElement" type="string" value=""/>'
        '<field id="maxRows" type="integer"/><field id="maxFieldSize" type="integer"/>'
        '<field id="batchCount" type="integer"/><field id="fetchSize" type="integer"/>'
        "<Options><QueryOptions><Fields/><Inputs/></QueryOptions></Options>"
        "</GenericOperationConfig></Configuration><Tracking><TrackedFields/></Tracking><Caching/></Operation>"
    )
    return _component_xml(name, description, folder_id, "connector-action", body, DATABASE_V2)


def build_disk_connection_xml(name: str, description: str, folder_id: str) -> str:
    """Disk V2 connection to the runtime's work directory (writable on cloud runtimes too)."""
    body = ('<GenericConnectionConfig><field id="directory" type="string" value="work"/>'
            '<field id="pollingInterval" type="integer" value="10000"/></GenericConnectionConfig>')
    return _component_xml(name, description, folder_id, "connector-settings", body, "disk-sdk")


def build_disk_operation_xml(name: str, description: str, folder_id: str, response_profile: str) -> str:
    """Disk V2 Create: writes the document to a file named by connector.disk-sdk.fileName."""
    fields = "".join(
        f'<ConnectorField filterable="{f}" name="{n}" selectable="true" selected="true" sortable="{f}"/>'
        for n, f in (("createdDate", "true"), ("directory", "false"), ("fileName", "true"), ("fileSize", "true"),
                     ("isDirectory", "true"), ("modifiedDate", "true"))
    )
    body = (
        '<Operation returnApplicationErrors="false" trackResponse="false"><Archiving directory="" enabled="false"/><Configuration>'
        '<GenericOperationConfig objectTypeId="FILE_CREATE_UPSERT" operationType="CREATE" requestProfileType="binary" '
        f'responseProfileType="json" responseProfile="{response_profile}">'
        '<field id="createDir" type="boolean" value="true"/>'
        '<field id="includeAll" type="boolean" value="true"/>'
        '<field id="actionIfFileExists" type="string" value="FORCE_UNIQUE_NAMES"/>'
        f'<Options><QueryOptions><Fields><ConnectorObject name="File"><FieldList>{fields}</FieldList></ConnectorObject></Fields>'
        "<Inputs/></QueryOptions></Options>"
        "</GenericOperationConfig></Configuration><Tracking><TrackedFields/></Tracking><Caching/></Operation>"
    )
    return _component_xml(name, description, folder_id, "connector-action", body, "disk-sdk")


def build_json_profile_xml(name: str, description: str, folder_id: str) -> str:
    """Empty JSON profile (Root / Object) for a generated map; fields are added in Boomi."""
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<bns:Component xmlns:bns="http://api.platform.boomi.com/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
        f'componentId="" name={quoteattr(name)} type="profile.json" folderId={quoteattr(folder_id)}>'
        f"<bns:description>{escape(description)}</bns:description><bns:encryptedValues/><bns:object>"
        '<JSONProfile strict="false"><DataElements>'
        '<JSONRootValue dataType="character" isMappable="true" isNode="true" key="1" name="Root">'
        "<DataFormat><ProfileCharacterFormat/></DataFormat>"
        '<JSONObject isMappable="false" isNode="true" key="2" name="Object"/>'
        "<Qualifiers><QualifierList/></Qualifiers></JSONRootValue>"
        "</DataElements><tagLists/></JSONProfile></bns:object></bns:Component>"
    )


def build_map_xml(name: str, description: str, folder_id: str, from_profile: str, to_profile: str) -> str:
    """Map between two profiles with no mappings yet."""
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<bns:Component xmlns:bns="http://api.platform.boomi.com/" '
        f'componentId="" folderId={quoteattr(folder_id)} name={quoteattr(name)} type="transform.map">'
        f"<bns:description>{escape(description)}</bns:description><bns:object>"
        f"<Map fromProfile={quoteattr(from_profile)} toProfile={quoteattr(to_profile)}>"
        "<Mappings/><Functions/><Defaults/><DocumentCacheJoins/></Map>"
        "</bns:object></bns:Component>"
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
