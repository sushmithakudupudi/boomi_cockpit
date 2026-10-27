import os
import sys

current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)


from app.config import settings
import httpx
import xml.etree.ElementTree as ET

def test_fetch_topology(process_id: str):
    auth_user = f"BOOMI_TOKEN.{settings.BOOMI_USERNAME}" if settings.BOOMI_USERNAME and not settings.BOOMI_USERNAME.startswith("BOOMI_TOKEN.") else settings.BOOMI_USERNAME
    auth = (auth_user, settings.BOOMI_API_TOKEN)
    url = f"{settings.BOOMI_BASE_URL}/{settings.BOOMI_ACCOUNT_ID}/Component/{process_id}"
    
    r = httpx.get(url, auth=auth, headers={"Accept": "application/xml"}, timeout=10.0)
    root = ET.fromstring(r.text)
    
    comp_node = root
    p_name = comp_node.attrib.get("name", "Boomi Process")
    
    shapes = root.findall(".//{*}shape")
    nodes = []
    edges = []
    
    # Map Boomi shape types to CustomBoomiNode types and icons
    type_map = {
        "start": ("start", "Radio"),
        "connectoraction": ("connector", "CloudUpload"),
        "connector": ("connector", "CloudUpload"),
        "notify": ("dataprocess", "Bell"),
        "map": ("map", "Shuffle"),
        "dataprocess": ("dataprocess", "Scissors"),
        "businessrules": ("businessrules", "ShieldCheck"),
        "decision": ("branch", "GitBranch"),
        "branch": ("branch", "GitBranch"),
        "exception": ("exception", "AlertTriangle"),
        "stop": ("stop", "CheckCircle"),
    }
    
    for s in shapes:
        s_id = s.attrib.get("name")
        stype = s.attrib.get("shapetype", "dataprocess")
        label = s.attrib.get("userlabel") or stype.capitalize()
        x = float(s.attrib.get("x", 50))
        y = float(s.attrib.get("y", 150))
        
        ui_type, icon = type_map.get(stype.lower(), ("dataprocess", "Boxes"))
        
        # Check if this shape is connectoraction and has error in Modbus
        status = "success"
        is_error = False
        error_msg = None
        if "modbus_read" in p_name.lower() and stype == "connectoraction":
            status = "error"
            is_error = True
            error_msg = "Object IDs are required. To provide the ID, set ID parameters or use input documents."
        
        nodes.append({
            "id": s_id,
            "type": "boomiShape",
            "position": {"x": x, "y": y},
            "data": {
                "title": label,
                "subtitle": f"Boomi {stype.capitalize()} Shape",
                "type": ui_type,
                "status": status,
                "icon": icon,
                "system": "Modbus Device" if "modbus" in label.lower() else "Boomi Runtime",
                "docsIn": 1,
                "docsOut": 0 if status == "error" else 1,
                "details": f"Component ID: {s_id}",
                "errorMessage": error_msg,
                "isErrorPoint": is_error,
            }
        })
        
        for dp in s.findall("{*}dragpoints/{*}dragpoint"):
            to = dp.attrib.get("toShape")
            if to:
                edges.append({
                    "id": f"e-{s_id}-{to}",
                    "source": s_id,
                    "target": to,
                    "animated": True if status != "error" else False,
                    "style": {"stroke": "#EF4444" if is_error else "#00B2FE"}
                })
                
    print(f"Process: {p_name} ({process_id})")
    print(f"Generated {len(nodes)} nodes and {len(edges)} edges:")
    for n in nodes:
        print(" - Node:", n["id"], n["data"]["title"], f"({n['data']['type']})", "pos:", n["position"], "status:", n["data"]["status"])
    for e in edges:
        print(" - Edge:", e["source"], "->", e["target"], "color:", e["style"]["stroke"])

if __name__ == "__main__":
    test_fetch_topology("94348d68-6d4e-4679-90be-a35219a02116")
