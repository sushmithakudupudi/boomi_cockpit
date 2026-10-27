import re
from typing import Any, Dict, List, Optional

DEFAULT_SETTINGS: Dict[str, bool] = {
    "enableTryCatchBoundary": True,
    "separateDPPvsDDP": True,
    "enableDocumentSplitCombine": True,
    "enforceIdempotentUpsert": True,
    "enable3xExponentialRetry": True,
    "deployInitialScheduleDisabled": True,
}

READ_CONNECTORS = ("Boomi Platform API", "HTTP Client", "REST API")
CONNECTOR_SHAPES = (
    "Boomi Platform API", "HTTP Client", "Salesforce", "NetSuite SuiteTalk",
    "SAP ERP", "PostgreSQL Database", "AWS S3 Data Lake", "ServiceNow",
)


def _as_dict(stage: Any) -> Dict[str, Any]:
    if isinstance(stage, dict):
        return stage
    if hasattr(stage, "model_dump"):
        return stage.model_dump()
    if hasattr(stage, "dict"):
        return stage.dict()
    return vars(stage)


def _slug(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", text).strip("_")


def merge_settings(settings: Optional[Dict[str, Any]]) -> Dict[str, bool]:
    merged = dict(DEFAULT_SETTINGS)
    for key, value in (settings or {}).items():
        if key in merged:
            merged[key] = bool(value)
    return merged


def describe_stage(stage: Dict[str, Any], rule: str) -> List[str]:
    """Per-shape build directives; mirrors describeStage in boomiPromptEngine.ts."""
    shape = stage.get("selectedShapeOrConnector", "")
    rule_text = rule or "the rule described in this stage's notes"
    lines: List[str] = []
    if shape == "Start - No Data":
        lines.append('Start shape, Type "No Data" (no input document; the process runs on schedule or manually).')
    elif shape == "Map & transform":
        lines.append("Boomi Map component translating the source profile to the target profile (see section 4).")
    elif shape == "Business Rules & DPP Shape":
        lines.append(f'Business Rules shape enforcing: "{rule_text}".')
        lines.append("Rejected documents are logged with the reason and routed cleanly to a Stop shape without throwing fatal exceptions.")
    elif shape == "Try/Catch & Set Properties":
        lines.append("Try/Catch shape with a Set Properties shape capturing error context in the Catch branch (see section 6).")
    elif shape == "Data Process (Split/Combine)":
        lines.append("Data Process shape. Use the processing step named in the notes (for example Base64 Encode/Decode, Split Documents, Combine Documents or a Groovy script); default to Split Documents on the root repeating element.")
    elif shape == "Decision & Route Shapes":
        lines.append(f'Decision shape routing documents by: "{rule_text}". The false path goes to a Notify shape then a Stop shape.')
    elif shape == "Message":
        lines.append("Message shape. Build the message text from the notes; use {1}, {2} parameters for dynamic values.")
    elif shape == "Set Properties":
        lines.append("Set Properties shape. Set the DPP/DDP values named in the notes (use DDP for per-document values, DPP for process-wide values).")
    elif shape == "Notify":
        lines.append("Notify shape. Level and message per the notes; User Log checked.")
    elif shape == "Boomi Platform API":
        lines.append("Boomi Platform API (AtomSphere API) connector shape with its own connection and operation components. Action and object (for example GET or QUERY on the object named in the notes) as stated in the notes; confirm the object name with the engineer.")
    elif shape == "HTTP Client":
        lines.append("HTTP Client connector shape with its own connection and operation components. HTTP method, URL path and headers as stated in the notes.")
    elif shape == "Stop":
        lines.append('Stop shape, "Continue processing other execution paths" checked.')
    elif shape == "Return Documents":
        lines.append("Return Documents shape returning the final documents to the caller.")
    elif stage.get("category") in ("DESTINATION", "SOURCE SYSTEM"):
        lines.append(f"{shape} connector shape with its own connection and operation components.")
    else:
        lines.append(f"{shape}: implement as a dedicated shape and confirm the configuration with the engineer.")
    notes = (stage.get("notes") or "").strip()
    if notes:
        lines.append(f"Configuration: {notes}")
    return lines


def describe_guardrails(settings: Optional[Dict[str, Any]]) -> str:
    s = merge_settings(settings)

    def state(flag: str) -> str:
        return "Enforced" if s[flag] else "Not requested"

    return (
        f"- Try/Catch Error Boundary: {state('enableTryCatchBoundary')}\n"
        f"- DPP vs DDP Scope Separation: {state('separateDPPvsDDP')}\n"
        f"- Document Splitting (JSON Arrays): {state('enableDocumentSplitCombine')}\n"
        f"- Idempotent Upsert Strategy: {state('enforceIdempotentUpsert')}\n"
        f"- 3x Exponential Backoff Retry: {state('enable3xExponentialRetry')}\n"
        f"- Deploy Initial Schedule Disabled: {state('deployInitialScheduleDisabled')}\n"
    )


def describe_canvas(stages: list) -> str:
    """Ordered canvas list used in both the OpenAI request and the fallback prompt."""
    rows = []
    for i, st in enumerate(_as_dict(x) for x in stages):
        notes = (st.get("notes") or "").strip()
        suffix = f" — {notes}" if notes else ""
        rows.append(f'{i + 1}. "{st.get("label", "")}" [{st.get("selectedShapeOrConnector", "")}]{suffix}')
    return "\n".join(rows)


def generate_fallback_blueprint_prompt(
    blueprint_id: str,
    source_name: str,
    target_name: str,
    stages: list,
    business_rule: str,
    settings: Optional[Dict[str, Any]] = None,
) -> str:
    """Deterministic prompt used when OpenAI is unavailable.

    Mirrors generateBoomiCompanionPrompt in src/services/boomiPromptEngine.ts.
    """
    rule = (business_rule or "").strip()
    has_rule = bool(rule)
    s = merge_settings(settings)
    stage_dicts = [_as_dict(st) for st in stages]
    shapes = [d.get("selectedShapeOrConnector", "") for d in stage_dicts]

    def has(shape: str) -> bool:
        return shape in shapes

    target = next((d for d in stage_dicts if d.get("category") == "DESTINATION"), stage_dicts[-1] if stage_dicts else {})
    is_read_target = target_name in READ_CONNECTORS
    is_listener = bool(re.search(r"listen|webhook|web services server|kafka|sqs", source_name, re.I))
    mentions_email = bool(re.search(r"e-?mail|lowercase", rule, re.I))
    action = "GET" if is_read_target else ("UPSERT" if s["enforceIdempotentUpsert"] else "INSERT")
    batch = 200
    src_slug, tgt_slug = _slug(source_name), _slug(target_name)

    retry_line = (
        "3x retries with exponential backoff on transient network faults."
        if s["enable3xExponentialRetry"]
        else "No automatic retry is requested; surface transient failures through the error path."
    )
    reliability = "handle retrieval, validation, transformation and execution-level failures."
    if s["enableTryCatchBoundary"]:
        reliability += " Include safe progress tracking and recoverable replay."
    if s["enforceIdempotentUpsert"] and not is_read_target:
        reliability += " Prevent duplicates."
    schedule_line = (
        "initial schedule must remain DISABLED upon deployment."
        if s["deployInitialScheduleDisabled"]
        else "confirm schedule settings with the engineer before deployment."
    )
    final_connector = target_name if target.get("category") == "DESTINATION" else "none"
    rule_line = f'"{rule}". Enforce correct type casting.' if has_rule else "none specified."

    parts = [
        f"""Implement the following plan through inspection, clarification, approval-gated development, testing, and handover. Treat the plan as requirements, not evidence that any actions have occurred.

## Integration Blueprint (ID: {blueprint_id})
Build ONE Boomi process whose canvas contains these shapes, connected left to right in exactly this order:""",
        describe_canvas(stages),
        f"""Use each quoted name as the shape label on the canvas.
- Entry: {source_name}.
- Final connector: {final_connector}.
- Business rule: {rule_line}
- Robustness: {retry_line}
- Reliability: {reliability}
- Schedule: {schedule_line}
- Handover: authorized Boomi resources and sandbox/dev endpoints only.

## Mandatory operating rules and approval gates
1. Inspect first: review available Companion skills/tools, environment, permissions, existing assets, runtime capabilities, source documentation and connector schemas before designing or changing assets. Do not assume a skill or tool exists.
2. Keep scope minimal: inspect only what is needed to establish the authorized development scope. Stop if the runtime, endpoints or authorization cannot be confirmed. Never touch production resources.
3. Separate facts from assumptions: label findings as verified, proposed, unconfirmed/plan, or blocked. Never invent connector IDs, credentials, schemas, approvals or outcomes.
4. Obtain explicit human approval before creating or modifying platform assets. Stop at the design gate until the blueprint, field mappings, error paths and component names are confirmed.

---

## Expert Boomi Architecture Directives & Canvas Implementation Specifications
""",
    ]

    # 1. Topology
    topo = ["### 1. Canvas Topology & Shape Sequencing", "Create the shapes in the order of the Integration Blueprint list. Per shape:"]
    for i, d in enumerate(stage_dicts, 1):
        topo.append(f"{i}. **{d.get('label', '')}** ({d.get('selectedShapeOrConnector', '')})")
        for line in describe_stage(d, rule):
            topo.append(f"   - {line}")
    extras = []
    if s["enableDocumentSplitCombine"] and not has("Data Process (Split/Combine)"):
        extras.append(f'- **Document Splitting:** if the {source_name} payload is an array or batch envelope, add a Data Process shape ("Split Documents") right after the entry shape so one bad record cannot poison the batch.')
    if s["enableTryCatchBoundary"] and not has("Try/Catch & Set Properties"):
        retry = ", Retry Count = 3" if s["enable3xExponentialRetry"] else ""
        extras.append(f'- **Try/Catch:** wrap the processing shapes in a Try/Catch. Catch Errors = "All Errors"{retry}.')
    if extras:
        topo += ["", "**Guardrail additions (not on the canvas list; add only these, and only if they fit):**", *extras]
    topo += ["", "- **Branch discipline:** Branch execution is strictly sequential; Branch 1 finishes all documents before Branch 2 starts."]
    if has("Return Documents"):
        term = "the canvas ends with Return Documents."
    elif has("Stop"):
        term = "the canvas ends with a Stop shape."
    elif is_listener:
        term = "end with Return Documents for synchronous listeners, Stop for asynchronous branches."
    else:
        term = "end with a Stop shape for batch flows."
    topo.append(f"- **Terminating shapes:** {term}")
    parts.append("\n".join(topo))

    # 2. Properties
    if s["separateDPPvsDDP"]:
        email_ddp = ", `DDP_NormalizedEmail`" if mentions_email else ""
        parts.append(
            "### 2. Strict Property Matrix (DPP vs DDP)\n"
            "*Never use Dynamic Process Properties for document-level values: later documents overwrite earlier ones.*\n"
            "- **DPP (execution scope only):** `DPP_BatchRunId`, `DPP_ExecutionStartTime`, `DPP_TotalRecordsIngested`, `DPP_TargetEnvironment`. Only create the ones the canvas needs.\n"
            f"- **DDP (per-document only):** `DDP_RecordId`{email_ddp}, `DDP_ValidationStatus`, `DDP_ErrorMessage`, `DDP_RetryAttempt`. Only create the ones the canvas needs."
        )
    else:
        parts.append("### 2. Properties\n- Track `RecordId` and error context as Dynamic properties. Confirm scoping with the engineer before use.")

    # 3. Business rule
    if has_rule or has("Decision & Route Shapes") or has("Business Rules & DPP Shape"):
        enforce = f'"{rule}"' if has_rule else "the rule described in the shape notes"
        parts.append(
            "### 3. Business Rules & Decision Shape\n"
            f"- Enforce: {enforce}.\n"
            "- Use a Decision shape for simple comparisons, or a Business Rules shape for multiple conditions.\n"
            "- Accepted path continues; rejected path goes to a Notify shape and a Stop shape. Never throw a fatal exception for a rejected document."
        )

    # 4. Map
    if has("Map & transform"):
        email_fn = (
            "- **Email normalization:** Standard Function -> String -> Lowercase from the source email field to the target email field.\n"
            if mentions_email
            else ""
        )
        parts.append(
            "### 4. Boomi Map Component\n"
            "- **Source profile:** profile for the data entering the Map shape. **Target profile:** profile for what the next shape expects.\n"
            f"{email_fn}"
            "- **Dates:** convert ISO-8601 timestamps to the target format using a Date Format function where dates are mapped.\n"
            "- **Defaults:** set default values for required fields missing in the source.\n"
            "- **Lookups:** use a Cross-Reference Table for code translations where applicable."
        )

    # 5. Connector operations
    if any(sh in CONNECTOR_SHAPES for sh in shapes):
        lines = [
            "### 5. Connector Operations",
            "- Create a separate connection component and operation component for each connector shape; keep them in the dev folder.",
        ]
        obj = "" if is_read_target else ", object confirmed with the engineer"
        lines.append(f"- **Final connector ({target_name}):** Action `{action}`{obj}.")
        if not is_read_target:
            lines.append(
                "- **Idempotency key:** an external ID field mapped from the source record key, so retries update rather than duplicate."
                if s["enforceIdempotentUpsert"]
                else "- Idempotency guard is not requested; call out any duplicate risk in the design review."
            )
            lines.append(f"- **Batching:** commit by profile, batch count = {batch} documents.")
        parts.append("\n".join(lines))

    # 6. Errors
    if s["enableTryCatchBoundary"]:
        parts.append(
            "### 6. Unified Error Handling\n"
            "In the **Catch branch**:\n"
            "- Set Properties: `DDP_ErrorMessage` = Document Property `Base - Try/Catch Message`.\n"
            f"- Message shape: `[Boomi Error] Process: PRC_{src_slug}_to_{tgt_slug}_Sync | Record: '{{1}}' | Error: '{{2}}' | Timestamp: '{{3}}'` with {{1}} = `DDP_RecordId`, {{2}} = `DDP_ErrorMessage`, {{3}} = current date/time.\n"
            '- Notify shape: level "Error", User Log checked.\n'
            "- Dead letter: route the document to a DLQ (disk folder, error bucket or Exception shape with Stop Execution = false)."
        )
    else:
        parts.append("### 6. Error Handling\n- Try/Catch boundary is not requested. Document the failure behavior of each shape in the design review.")

    # 7. Handover
    disabled = " with Schedule = **DISABLED**" if s["deployInitialScheduleDisabled"] else ""
    parts.append(
        "### 7. Handover & Deployment Safety\n"
        f"- Deploy to a Dev/Sandbox Atom{disabled}.\n"
        "- Provide 3 reproducible test cases: happy path, rule-rejected or empty result, and malformed input.\n"
        "- Await human sign-off before activating any listener or scheduler.\n"
    )

    return "\n\n".join(parts)
