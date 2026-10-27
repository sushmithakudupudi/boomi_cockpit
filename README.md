# 🚀 BoomiOps Cockpit (Boomi Companion Command Center)
### *The Autonomous Integration Operations & Self-Healing Hub*

---

## 💡 The Core Problem Solved
Boomi Companion is powerful, but traditionally trapped inside the developer canvas in AtomSphere.
* **L1/L2 Support Friction:** Ops & support teams lack Boomi developer licenses and cannot decipher complex XML/JSON shapes, yet are on call 24/7 for failed batch runs.
* **Business Stakeholder Delays:** Finance and Supply Chain wait hours to know if an SAP-to-Salesforce or NetSuite sync failed.
* **High MTTR:** Investigating failed executions, parsing raw document payloads, and manually triggering re-runs takes 30–60 minutes per incident.

---

## ✨ System Architecture

```text
 ┌────────────────────────────────────────────────────────┐
 │                      React Web UI                      │
 │  ┌───────────────────────┐  ┌───────────────────────┐  │
 │  │ Interactive Process   │  │ Boomi Companion AI    │  │
 │  │ Visualizer & Health   │  │ Conversational Drawer │  │
 │  │ (React Flow + Charts) │  │ (Chat, Root Cause,    │  │
 │  │                       │  │ Remediation Actions)  │  │
 │  └───────────────────────┘  └───────────────────────┘  │
 └──────────────────────────┬─────────────────────────────┘
                            │ REST / WebSocket (/api)
                            ▼
 ┌────────────────────────────────────────────────────────┐
 │                FastAPI Backend Gateway                 │
 └─────────────┬────────────────────────────┬─────────────┘
               │                            │
               ▼                            ▼
     [Boomi Companion / AI Engine]   [Boomi AtomSphere REST APIs]
     - Natural Language Reasoning     - Process Reporting API
     - Error Log Explanation          - Execution Summary API
     - Fix Recommendations            - Reprocess Document API
```

---

## 🛠️ Tech Stack
* **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Lucide React, `@xyflow/react` (React Flow), Canvas Confetti
* **Backend:** Python 3.12, FastAPI, Uvicorn, Pydantic v2, HTTPX, Python-Dotenv
* **AI & Integration:** Boomi Companion Autonomous Reasoning Engine & Boomi AtomSphere REST API Connectors

---

## 🔌 FastAPI Backend API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/executions` | Fetches process executions from AtomSphere Process Reporting API |
| `GET` | `/api/executions/{id}` | Fetches detailed execution record, raw payload, and stacktrace |
| `POST` | `/api/companion/chat` | Natural Language Operations chat with Boomi Companion AI |
| `POST` | `/api/companion/triage/{id}` | 1-Click AI Root Cause, payload inspection, and auto-generated patch |
| `POST` | `/api/reprocess` | Autonomous Self-Healing: injects corrected document into Boomi API |
| `POST` | `/api/executions/{id}/reprocess` | Reprocess document by execution ID |
| `GET` | `/api/atoms` | Live Atom, Molecule cluster, and Cloud runtime telemetry |
| `GET` | `/api/topology/{process_id}` | Node and edge topology graph for the integration pipeline |
| `GET` | `/api/stats` | Platform execution stats, error rates, and MTTR reduction metrics |
| `POST` | `/api/reset` | Resets demo failure state for repeated judge demos |
| `GET` | `/api/health` | Health check endpoint |
| `WS` | `/api/ws` | WebSocket channel for real-time telemetry streaming |
| `GET` | `/docs` | Interactive Swagger UI API documentation |

---

## 🏃 Getting Started

### 1. Install Dependencies
```bash
# Frontend dependencies
npm install

# Backend dependencies (Python 3.10+)
pip install -r backend/requirements.txt
```

### 2. Run the FastAPI Backend
```bash
# Start FastAPI backend on http://localhost:8000
python backend/run.py
# Or using npm shortcut:
npm run backend
```
*Interactive Swagger API documentation is available at:* `http://localhost:8000/docs`

### 3. Run Backend Verification Tests
```bash
python backend/test_api.py
# Or:
npm run test:backend
```

### 4. Run the React Frontend
```bash
npm run dev
```
Visit `http://localhost:5173` in your browser. All `/api` requests are automatically proxied to the FastAPI server on port 8000.

---

## 🎬 Live Hackathon Demo Walkthrough for Judges

1. **Observe the Active Failure:**
   * Top incident banner: `P1 Critical — SAP_to_Salesforce_Order_Sync`.
   * Check the **Live Integration Topology**: Shape #4 (`Boomi Map: SAP ORDERS05 to SFDC Order`) is highlighted red.
2. **Triage with Boomi Companion:**
   * Click **"Triage with Companion"** to open the AI analysis modal.
   * View the decoded root cause: SAP IDoc truncated the postal code `9401` (schema requires 5 digits).
   * Open the **"Payload Inspector & Diff"** tab: Inspect side-by-side original payload vs. Companion's auto-generated fix (`"09401"`).
3. **Execute Self-Healing:**
   * Click **"Execute Self-Healing & Reprocess"**.
   * FastAPI reprocesses the document via Boomi AtomSphere API.
   * Status flips from **Error** to **Auto-Healed (Success)** and the interactive flow graph lights up green!
4. **Chat with Boomi Companion:**
   * Click the **"Boomi Companion"** button in the header.
   * Ask queries like:
     * *"Why did exec-8921 fail?"*
     * *"Show me all processes that failed in the US Production Atom today"*
     * *"Show blast radius for SAP Connector"*
     * *"What is the average latency of our payment webhook?"*
     * *"Generate Mermaid integration spec"*
