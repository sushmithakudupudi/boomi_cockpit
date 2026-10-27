"""
Explicitly-labelled SAMPLE revision fixtures for the Revision History module.

These are NOT Boomi data. They exist so the comparison UI and engine can be exercised
when no AtomSphere credentials are configured or historical definitions are unavailable.
The API tags every response built from this module with source="sample".
"""
from typing import Dict, List

SAMPLE_PROCESS_ID = "sample-proc-0001-order-sync"
SAMPLE_MAP_ID = "sample-map-0001-order-to-invoice"
SAMPLE_SINGLE_ID = "sample-proc-0002-single-revision"

NS = 'xmlns:bns="http://api.platform.boomi.com/"'


def _component(cid: str, version: int, name: str, ctype: str, body: str) -> str:
    return (f'<bns:Component {NS} componentId="{cid}" version="{version}" name="{name}" type="{ctype}">'
            f'<bns:description>Sample fixture</bns:description><bns:object>{body}</bns:object></bns:Component>')


def _prop(name: str, value: str, pid: str = None, vtype: str = "static") -> str:
    pid = pid or f"dynamicdocument.{name}"
    inner = f'<staticparameter staticproperty="{value}"/>' if vtype == "static" else f'<trackparameter propertyId="{value}" propertyName="{value}"/>'
    return (f'<documentproperty name="Dynamic Document Property - {name}" propertyId="{pid}" shouldEncrypt="false" defaultValue="">'
            f'<sourcevalues><parametervalue key="0" valueType="{vtype}">{inner}</parametervalue></sourcevalues></documentproperty>')


def _shape(name: str, stype: str, cfg: str, to: str = None, label: str = "", x: int = 0, extra_dp: str = "") -> str:
    dp = f'<dragpoint name="{name}.dragpoint1" toShape="{to}" x="{x + 80}" y="50"/>' if to else ""
    return (f'<shape image="{stype}_icon" name="{name}" shapetype="{stype}" userlabel="{label}" x="{x}" y="46">'
            f'<configuration>{cfg}</configuration><dragpoints>{dp}{extra_dp}</dragpoints></shape>')


def _process(cid: str, version: int, shapes: str, settings: str = 'allowSimultaneous="false"', x_shift: int = 0) -> str:
    return _component(cid, version, "Sample_Order_Sync", "process", f'<process {settings}><shapes>{shapes}</shapes></process>')


def _map_ref(mid: str) -> str:
    return f'<map mapId="{mid}"/>'


def _connector(op: str, action: str = "Send") -> str:
    return f'<connectoraction actionType="{action}" connectorType="http" operationId="{op}" connectionId="conn-1"/>'


def _process_revisions() -> Dict[int, str]:
    pid, mid = SAMPLE_PROCESS_ID, SAMPLE_MAP_ID
    props_r1 = _prop("DDP_ORDER_ID", "ORD") + _prop("DDP_SOURCE", "SAP")
    props_r2 = props_r1 + _prop("DDP_REGION", "EMEA")
    props_r3 = _prop("DDP_ORDER_ID", "ORD-V2") + _prop("DDP_REGION", "EMEA")

    def build(version, props, op, decision=False, shift=0, reroute=False):
        end_to = "shape7" if decision else "shape6"
        s = [
            _shape("shape1", "start", "<noaction/>", "shape2", "Start", x=shift),
            _shape("shape2", "map", _map_ref(mid), "shape3", "Order to Invoice", x=shift + 100),
            _shape("shape3", "documentproperties", f"<documentproperties>{props}</documentproperties>", "shape4", "Set Properties", x=shift + 200),
            _shape("shape4", "connectoraction", _connector(op), "shape5" if not decision else "shape5", "Post Invoice", x=shift + 300),
            _shape("shape5", "stop", "<stop continue=\"true\"/>", None, "End", x=shift + 400),
        ]
        if decision:
            s[3] = _shape("shape4", "connectoraction", _connector(op), "shape6", "Post Invoice", x=shift + 300)
            s.append(_shape("shape6", "decision", '<decision comparison="equals"/>', "shape5", "Is EMEA?", x=shift + 350))
        return _process(pid, version, "".join(s))

    return {
        1: build(1, props_r1, "op-post-invoice-v1"),
        2: build(2, props_r2, "op-post-invoice-v1"),
        3: build(3, props_r3, "op-post-invoice-v1", shift=40),  # coordinates moved: must not count as a change
        4: build(4, props_r3, "op-post-invoice-v2", decision=True, shift=40),
    }


def _mapping(frm: str, to: str) -> str:
    return f'<Mapping fromKey="{frm}" fromKeyPath="*[@key={frm}]" fromNamePath="Order/{frm}" fromType="profile" toKey="{to}" toKeyPath="*[@key={to}]" toNamePath="Invoice/{to}" toType="profile"/>'


def _map_def(version: int, mappings: List[str], functions: str = "") -> str:
    body = (f'<Map sourceProfile="prof-order" targetProfile="prof-invoice"><Mappings>{"".join(mappings)}</Mappings>'
            f'<Functions>{functions}</Functions></Map>')
    return _component(SAMPLE_MAP_ID, version, "Sample_Order_to_Invoice_Map", "transform.map", body)


def _func(key: str, name: str, script: str) -> str:
    return (f'<FunctionStep key="{key}" name="{name}" type="CustomScripting" position="{key}">'
            f'<Inputs><Input key="1" name="in"/></Inputs><Outputs><Output key="1" name="out"/></Outputs>'
            f'<Configuration><Scripting language="groovy">{script}</Scripting></Configuration></FunctionStep>')


def _map_revisions() -> Dict[int, str]:
    base = [_mapping("2", "10"), _mapping("3", "11")]
    return {
        1: _map_def(1, base),
        2: _map_def(2, base + [_mapping("4", "12")], _func("1", "Format Date", "out = in.trim()")),
        3: _map_def(3, [_mapping("2", "10"), _mapping("5", "11"), _mapping("4", "12")], _func("1", "Format Date", "out = in.trim().toUpperCase()")),
    }


def _meta(cid: str, version: int, name: str, ctype: str, by: str, date: str, current: bool, desc: str = "") -> Dict:
    return {"componentId": cid, "version": version, "name": name, "type": ctype, "modifiedBy": by,
            "modifiedDate": date, "createdBy": "sample.author@example.com", "createdDate": "2025-01-09T09:00:00Z",
            "currentVersion": current, "deleted": False, "folderName": "Sample", "description": desc}


PROCESS_NAME, MAP_NAME, SINGLE_NAME = "Sample_Order_Sync", "Sample_Order_to_Invoice_Map", "Sample_Single_Revision_Process"

REVISIONS: Dict[str, List[Dict]] = {
    SAMPLE_PROCESS_ID: [
        _meta(SAMPLE_PROCESS_ID, 1, PROCESS_NAME, "process", "alice@example.com", "2025-01-10T10:00:00Z", False),
        _meta(SAMPLE_PROCESS_ID, 2, PROCESS_NAME, "process", "bob@example.com", "2025-02-02T14:30:00Z", False),
        _meta(SAMPLE_PROCESS_ID, 3, PROCESS_NAME, "process", "alice@example.com", "2025-03-15T08:15:00Z", False),
        _meta(SAMPLE_PROCESS_ID, 4, PROCESS_NAME, "process", "carol@example.com", "2025-05-01T16:45:00Z", True),
    ],
    SAMPLE_MAP_ID: [
        _meta(SAMPLE_MAP_ID, 1, MAP_NAME, "transform.map", "alice@example.com", "2025-01-09T09:30:00Z", False),
        _meta(SAMPLE_MAP_ID, 2, MAP_NAME, "transform.map", "bob@example.com", "2025-02-20T11:00:00Z", False),
        _meta(SAMPLE_MAP_ID, 3, MAP_NAME, "transform.map", "carol@example.com", "2025-04-10T13:20:00Z", True),
    ],
    SAMPLE_SINGLE_ID: [
        _meta(SAMPLE_SINGLE_ID, 1, SINGLE_NAME, "process", "dave@example.com", "2025-06-01T09:00:00Z", True),
    ],
}

DEFINITIONS: Dict[str, Dict[int, str]] = {
    SAMPLE_PROCESS_ID: _process_revisions(),
    SAMPLE_MAP_ID: _map_revisions(),
    SAMPLE_SINGLE_ID: {1: _process(SAMPLE_SINGLE_ID, 1, _shape("shape1", "start", "<noaction/>", "shape2", "Start")
                                   + _shape("shape2", "stop", "<stop continue=\"true\"/>", None, "End"))},
}
