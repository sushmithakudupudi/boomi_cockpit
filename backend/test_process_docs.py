import os
import sys

current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

import test_support
from fastapi.testclient import TestClient
from app.main import app
from app.data import revision_samples as s
from app.services.companion_ai import companion_ai_service

client = test_support.signed_in_client()


def test_process_docs():
    companion_ai_service._openai_client = None  # XML-derived docs only, no network

    # docs sit behind sign-in like every other API route
    anon = TestClient(app)
    assert anon.get(f"/api/process-docs/{s.SAMPLE_PROCESS_ID}", params={"source": "sample"}).status_code == 401
    assert anon.get(f"/api/process-docs/{s.SAMPLE_PROCESS_ID}/export", params={"source": "sample", "format": "pdf"}).status_code == 401

    r = client.get(f"/api/process-docs/{s.SAMPLE_PROCESS_ID}", params={"source": "sample"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["version"] == 4 and not d["aiSummary"]
    assert [x["id"] for x in d["steps"]] == ["shape1", "shape2", "shape3", "shape4", "shape6", "shape5"]
    md = d["markdown"]
    assert "Sample_Order_to_Invoice_Map" in md and "`DDP_REGION`" in md and "```mermaid" in md
    assert "shape4 --> shape6" in d["mermaid"]

    # a specific older revision, and its summary
    d2 = client.get(f"/api/process-docs/{s.SAMPLE_PROCESS_ID}", params={"source": "sample", "version": 2}).json()
    assert d2["version"] == 2 and "shape6" not in [x["id"] for x in d2["steps"]]
    assert "Sample_Order_to_Invoice_Map" in d2["summary"]
    assert client.get(f"/api/process-docs/{s.SAMPLE_PROCESS_ID}", params={"source": "sample", "version": 99}).status_code == 404

    # Word and PDF downloads use a readable flow instead of Mermaid code
    assert "```mermaid" not in d["exportMarkdown"] and "**Post Invoice** → **Is EMEA?**" in d["exportMarkdown"]
    for fmt, magic in (("docx", b"PK"), ("pdf", b"%PDF")):
        r = client.get(f"/api/process-docs/{s.SAMPLE_PROCESS_ID}/export", params={"source": "sample", "version": 4, "format": fmt})
        assert r.status_code == 200 and r.content.startswith(magic), fmt
        assert f"Sample_Order_Sync_v4.{fmt}" in r.headers["content-disposition"]

    # non-process components are documented too: a map lists its mappings and functions
    r = client.get(f"/api/process-docs/{s.SAMPLE_MAP_ID}", params={"source": "sample", "version": 2})
    assert r.status_code == 200, r.text
    m = r.json()
    assert m["componentType"] == "Map" and m["steps"] == [] and "## Mappings" in m["markdown"]
    assert "Order/4" in m["markdown"] and "Format Date" in m["markdown"] and "prof-order" in m["markdown"]
    assert "3 field mapping(s)" in m["summary"]
    r = client.get(f"/api/process-docs/{s.SAMPLE_MAP_ID}/export", params={"source": "sample", "version": 2, "format": "pdf"})
    assert r.status_code == 200 and r.content.startswith(b"%PDF")


def test_component_docs_masks_secrets():
    from app.services import component_docs, revision_diff as diff

    xml = ('<bns:Component xmlns:bns="http://api.platform.boomi.com/" componentId="c1" name="Salesforce Prod" '
           'type="connector-settings" subType="salesforce"><bns:object><SalesforceConnection url="https://login.salesforce.com" '
           'user="svc@acme.com" password="hunter2"/></bns:object></bns:Component>')
    f = component_docs.extract(diff.parse_definition(xml), {"componentId": "c1", "version": 1})
    md = component_docs.build_markdown(f, {"componentId": "c1", "version": 1}, {}, None)
    assert f["typeLabel"] == "Connection" and "`salesforce`" in md
    assert "hunter2" not in md and "[masked]" in md and "https://login.salesforce.com" in md


if __name__ == "__main__":
    test_process_docs()
    test_component_docs_masks_secrets()
    print("process docs: OK")
