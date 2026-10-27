import os
import sys

# Ensure backend directory is in path
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_endpoints():
    print("Testing /api/health...")
    r = client.get("/api/health")
    assert r.status_code == 200, f"Health check failed: {r.text}"
    print("[PASS] Health check:", r.json())

    print("\nTesting GET /api/executions...")
    r = client.get("/api/executions")
    assert r.status_code == 200
    execs = r.json()
    assert len(execs) >= 7
    print(f"[PASS] Found {len(execs)} executions. First ID: {execs[0]['id']}")

    print("\nTesting GET /api/executions/exec-8921...")
    r = client.get("/api/executions/exec-8921")
    assert r.status_code == 200
    sap_exec = r.json()
    assert sap_exec["id"] == "exec-8921"
    assert sap_exec["status"] == "ERROR"
    print(f"[PASS] Execution detail for {sap_exec['id']}: status = {sap_exec['status']}")

    print("\nTesting GET /api/atoms...")
    r = client.get("/api/atoms")
    assert r.status_code == 200
    atoms = r.json()
    assert len(atoms) == 3
    print(f"[PASS] Found {len(atoms)} Atoms. Names: {[a['name'] for a in atoms]}")

    print("\nTesting GET /api/topology/proc-sap-sfdc-001...")
    r = client.get("/api/topology/proc-sap-sfdc-001")
    assert r.status_code == 200
    topology = r.json()
    assert len(topology["nodes"]) >= 6
    assert len(topology["edges"]) >= 5
    print(f"[PASS] Topology loaded: {len(topology['nodes'])} nodes, {len(topology['edges'])} edges")

    print("\nTesting POST /api/companion/chat (query: 'Why did exec-8921 fail?')...")
    r = client.post("/api/companion/chat", json={"prompt": "Why did exec-8921 fail?"})
    assert r.status_code == 200
    chat_resp = r.json()
    assert "exec-8921" in chat_resp["message"]["text"] or "postalCode" in chat_resp["message"]["text"]
    assert chat_resp["message"]["suggestedAction"]["type"] == "REPROCESS"
    print(f"[PASS] Companion Chat response: {chat_resp['message']['text'][:90]}...")

    print("\nTesting POST /api/companion/triage/exec-8921...")
    r = client.post("/api/companion/triage/exec-8921")
    assert r.status_code == 200
    triage_resp = r.json()
    assert triage_resp["executionId"] == "exec-8921"
    assert "9401" in triage_resp["rootCause"] or "postal" in triage_resp["rootCause"].lower()
    print(f"[PASS] Triage response: Root cause = {triage_resp['rootCause'][:80]}...")

    print("\nTesting POST /api/reprocess...")
    r = client.post("/api/reprocess", json={"executionId": "exec-8921"})
    assert r.status_code == 200
    reprocess_resp = r.json()
    assert reprocess_resp["success"] is True
    assert reprocess_resp["status"] == "SUCCESS"
    assert reprocess_resp["updatedExecution"]["reprocessed"] is True
    print(f"[PASS] Reprocess successful: status = {reprocess_resp['status']}, msg = {reprocess_resp['message']}")

    print("\nTesting GET /api/stats...")
    r = client.get("/api/stats")
    assert r.status_code == 200
    stats = r.json()
    assert stats["autoHealedCount"] >= 1
    print(f"[PASS] Stats: Total = {stats['totalExecutions']}, Success Rate = {stats['successRatePercent']}%, Auto-healed = {stats['autoHealedCount']}")

    print("\nTesting POST /api/reset...")
    r = client.post("/api/reset")
    assert r.status_code == 200
    reset_resp = r.json()
    print(f"[PASS] Reset successful: {reset_resp['message']}")

    # Verify exec-8921 is ERROR again after reset
    r = client.get("/api/executions/exec-8921")
    assert r.json()["status"] == "ERROR"
    print("[PASS] Verified reset restored initial failure state!")

    print("\n===============================")
    print("ALL 9 BACKEND API TESTS PASSED!")
    print("===============================")

if __name__ == "__main__":
    test_endpoints()
