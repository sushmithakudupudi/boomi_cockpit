import os
import sys

current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

import test_support
from app.main import app
from app.data import revision_samples as s

client = test_support.signed_in_client()
P, M = s.SAMPLE_PROCESS_ID, s.SAMPLE_MAP_ID


def compare(cid, a, b, unchanged=False):
    r = client.get(f"/api/revisions/components/{cid}/compare",
                   params={"source": "sample", "fromVersion": a, "toVersion": b, "includeUnchanged": unchanged})
    assert r.status_code == 200, r.text
    return r.json()


def test_revisions():
    r = client.get("/api/revisions/components", params={"source": "sample", "q": "order"})
    assert r.status_code == 200 and {c["componentId"] for c in r.json()["components"]} == {P, M}
    assert client.get("/api/revisions/components", params={"source": "sample", "type": "process"}).json()["components"]
    assert client.get("/api/revisions/components", params={"source": "sample", "author": "nobody"}).json()["components"] == []

    revs = client.get(f"/api/revisions/components/{P}/revisions", params={"source": "sample"}).json()["revisions"]
    assert [x["version"] for x in revs] == [4, 3, 2, 1]

    # identical revision and coordinate-only change produce no false positives
    assert compare(P, 2, 2)["summary"]["total"] == 0
    assert compare(P, 1, 1)["summary"]["total"] == 0

    # non-consecutive: 1 -> 4
    d = compare(P, 1, 4)
    titles = [c["title"] for c in d["changes"]]
    assert any(c["category"] == "setprops" and c["changeType"] == "added" and "DDP_REGION" in c["title"] for c in d["changes"]), titles
    assert any(c["category"] == "setprops" and c["changeType"] == "removed" and "DDP_SOURCE" in c["title"] for c in d["changes"]), titles
    assert any(c["category"] == "setprops" and c["changeType"] == "modified" and "DDP_ORDER_ID" in c["title"] for c in d["changes"]), titles
    assert any(c["category"] == "other" and "operationId" in str(c["fieldChanges"]) for c in d["changes"]), titles
    assert any(c["category"] == "other" and c["changeType"] == "added" and c["shapeType"] == "decision" for c in d["changes"]), titles
    # referenced Map definitions: map v1 (Jan 10) -> v3 (before May 1)
    maps = [c for c in d["changes"] if c["category"] == "map"]
    assert any(c["scope"] == "mapping" and c["changeType"] == "added" for c in maps)
    assert any(c["scope"] == "mapping" and c["changeType"] == "modified" for c in maps)
    assert any(c["scope"] == "function" for c in maps)
    assert d["resolvedMaps"][0]["leftVersion"] == 1 and d["resolvedMaps"][0]["rightVersion"] == 3

    # 2 -> 3 only touches properties; coordinate shift (x/y) must not register
    d = compare(P, 2, 3)
    assert {c["shapeType"] for c in d["changes"] if c["source"] is None and c["scope"] != "metadata"} <= {"documentproperties"}, [c["title"] for c in d["changes"]]

    # unchanged requested
    assert compare(P, 2, 2, True)["summary"]["unchanged"] > 0

    # map component compared directly, with an ambiguity flag for the re-target
    d = compare(M, 2, 3)
    assert d["kind"] == "map" and d["summary"]["total"] >= 2

    # single revision + errors
    assert len(client.get(f"/api/revisions/components/{s.SAMPLE_SINGLE_ID}/revisions", params={"source": "sample"}).json()["revisions"]) == 1
    r = client.get(f"/api/revisions/components/{P}/compare", params={"source": "sample", "fromVersion": 1, "toVersion": 99})
    assert r.status_code == 404 and r.json()["detail"]["code"] == "not_found"
    r = client.get("/api/revisions/components", params={"source": "live"})
    assert r.status_code in (200, 503, 502, 401, 403)

    # upload comparison + invalid XML
    from app.data.revision_samples import DEFINITIONS
    r = client.post("/api/revisions/compare-xml", json={"leftXml": DEFINITIONS[P][1], "rightXml": DEFINITIONS[P][2]})
    assert r.status_code == 200 and r.json()["source"] == "upload" and r.json()["summary"]["total"] > 0
    assert client.post("/api/revisions/compare-xml", json={"leftXml": "<a", "rightXml": "<b/>"}).status_code == 422

    # sensitive values masked
    from app.services.revision_diff import compare_definitions
    a = '<c name="x" type="x"><object><cfg password="one"/></object></c>'
    b = '<c name="x" type="x"><object><cfg password="two"/></object></c>'
    c = compare_definitions(a, b)["changes"][0]
    assert c["fieldChanges"][0]["old"] == c["fieldChanges"][0]["new"] == "[masked]" and c["fieldChanges"][0]["masked"]
    print("[PASS] revision history")


if __name__ == "__main__":
    test_revisions()
