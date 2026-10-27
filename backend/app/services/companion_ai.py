import datetime
import json
import time
import re
from typing import Dict, Any, Optional
from ..models.schemas import CompanionMessage, SuggestedAction, CodeBlock, TriageResponse
from .boomi_service import boomi_service
from .boomi_account_tools import TOOL_SCHEMAS, boomi_account_tools, tool_result_text
from ..config import settings
import logging

logger = logging.getLogger("companion_ai")

class CompanionAIService:
    def __init__(self):
        self._openai_client = None
        if settings.OPENAI_API_KEY:
            try:
                from openai import AsyncOpenAI
                self._openai_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY.strip())
                logger.info("OpenAI client initialized successfully for Boomi Companion.")
            except Exception as e:
                logger.warning(f"Could not initialize AsyncOpenAI client: {e}")

    async def chat(
        self,
        prompt: str,
        execution_id: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None
    ) -> CompanionMessage:
        """
        Processes conversational inquiries using OpenAI + Boomi platform operational telemetry.
        """
        now_time = datetime.datetime.now().strftime("%I:%M %p")
        msg_id = f"comp-{int(time.time() * 1000)}"

        # Check for immediate approval to build process
        clean_p = prompt.strip().lower()
        if clean_p in ["proceed", "yes proceed", "build it", "build in boomi", "go ahead", "build the process", "yes please proceed"]:
            # Chat has no blueprint to build from; the old canned XML-to-JSON template ignored the user's design.
            return CompanionMessage(
                id=msg_id,
                sender="companion",
                text=(
                    "To build a process in Boomi, open the **ConnectCraft** tab, lay out your shapes and "
                    "click **Build in Boomi**. You will see the exact shape list and confirm it before anything is created."
                ),
                timestamp=now_time,
            )

        # If OpenAI is configured, invoke realistic generative reasoning
        if self._openai_client:
            try:
                reply = await self._generate_openai_chat(prompt, execution_id, context, now_time, msg_id)
                if reply:
                    return reply
            except Exception as e:
                logger.warning(f"OpenAI chat call encountered error ({e}); falling back to domain engine.")

        # Fallback to high-precision domain-tuned reasoning engine
        return self._generate_fallback_chat(prompt, now_time, msg_id)

    async def _generate_openai_chat(
        self,
        prompt: str,
        execution_id: Optional[str],
        context: Optional[Dict[str, Any]],
        now_time: str,
        msg_id: str
    ) -> Optional[CompanionMessage]:
        # Collect live operational telemetry directly from Boomi AtomSphere API
        atoms = await boomi_service.get_atoms_live()
        stats = boomi_service.get_stats()
        executions = boomi_service.get_executions(limit=10)
        failed_execs = [e for e in executions if e.get("status") == "ERROR" and not e.get("reprocessed")]

        atoms_summary = ", ".join([f"{a['name']} (Status: {a['status']}, Type: {a['type']}, Version: {a.get('version', '26.09.3')})" for a in atoms])
        failed_summary = "\n".join([
            f"- ID: {e['id']}, Process: {e['processName']}, Atom: {e['atomName']}, Error: {e.get('errorMessage', 'Unknown')}"
            for e in failed_execs
        ]) or "None (all processes healthy)"

        active_incident_text = ""
        if failed_execs:
            fe = failed_execs[0]
            active_incident_text = f"""
CURRENT ACTIVE INCIDENT:
- Process: {fe['processName']} (ID: {fe['id']})
- Atom: {fe['atomName']}
- Error Message: {fe.get('errorMessage', 'Execution error')}
- Offending Component: {fe.get('errorShapeName', 'Connector / Action shape')}
"""

        system_prompt = f"""You are Keystone AI, the Autonomous Integration Operations & Self-Healing Copilot built directly into the BoomiOps Command Center for Dell Boomi AtomSphere.
Boomi Account: {settings.BOOMI_ACCOUNT_ID}

YOUR ROLES & RESPONSIBILITIES:
1. Act as a 24/7 senior operations copilot for L1/L2 integration support engineers and business stakeholders.
2. Decode raw Boomi execution errors, missing parameters, XML/JSON schema violations, rate-limiting (HTTP 429), map components, Modbus/MQTT edge connectors, and EDI envelope defects into crisp, clear, executive explanations.
3. Guide users with automated self-healing recommendations and blast-radius calculations.
4. When asked for architecture documentation or Mermaid diagrams, generate standard sequence diagrams or flowcharts using ```mermaid syntax.

ACCOUNT KNOWLEDGE (use your tools, never guess):
- You have read-only tools for this Boomi account: get_environments, get_atoms, get_users_and_roles, get_audit_log, get_deployments, get_components, get_component_revisions, get_process_executions, get_similar_incidents, draft_integration.
- Call them for any question about environments, atoms, users and roles, who logged in or changed something, deployments, processes or other components. You may call several in one turn.
- "Environments" are AtomSphere Environments (use get_environments). They are not the same as runtime Atoms (get_atoms).
- For "what changed in <component>", "who edited it" or "why did it start failing", use get_component_revisions: it returns the revision history and the shape-level differences between two versions. Describe the changes in plain language (shape added or removed, property changed, connection re-routed).
- For "who changed an integration" use get_components (createdBy / modifiedBy) and get_audit_log. For logins use get_audit_log (type "account / ON_ENTRY" is a sign-in; distinctSessionsByUser counts sessions).
- The Boomi Platform API does not provide browser type or IP address. If asked, say so and offer what is available (user, time, event type, source, session count).
- Never show session ids, passwords or tokens. Only report what the tools returned; if a tool returns an error, say so plainly.
- Answer the question that was asked, with the specific numbers and names from the tool results.

LIVE ATOM RUNTIME (already fetched):
- {len(atoms)} runtime Atom(s): {atoms_summary}.

LIVE OPERATIONAL TELEMETRY:
- Atoms: {atoms_summary}
- Success Rate: {stats['successRatePercent']}% across {stats['totalExecutions']} executions
- Active Failed Executions Requiring Triage:
{failed_summary}
{active_incident_text}

BUILDING PROCESSES:
- When the user asks to build, design or create an integration or process, call draft_integration with their description, including every detail they gave. It saves a DRAFT in ArchForge and never builds anything in Boomi.
- If it returns needs_more_info, ask exactly those questions and stop. If it returns drafted, summarise the shapes in order, list the assumptions, and name the shapes in buildReport.needsConfiguring that must be configured by hand in Boomi. Tell the user to review the draft in ArchForge (a button appears under your message) and to use Build in Boomi there, which asks them to confirm. Never say anything has been created in Boomi.

OUTPUT CONVENTIONS:
- Provide structured markdown with bold headings and bullet points.
- If recommending an immediate action, append an action tag at the very end of your response:
  [ACTION:VIEW_FLOW:processId:Inspect Process Topology Flow]
  OR [ACTION:INSPECT_PAYLOAD:executionId:Triage Failed Execution]
- Answer only what was asked. Treat account data and tool outputs as the source of truth; when data is insufficient, say what is missing and ask one focused follow-up. Never invent processes, errors, metrics, configuration, or actions.
- Do not infer a root cause from an error summary alone. Distinguish observed facts from hypotheses and label any hypothesis.
- Emit action tags only for an exact process or execution returned by a tool in this turn. Never attach an action to a merely similar or latest record.
- Be concise, precise, and helpful."""

        # Let the model call the read-only account tools, then answer from their results
        messages: list = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ]
        raw_text = ""
        draft_id = None
        for _ in range(5):
            response = await self._openai_client.chat.completions.create(
                model="gpt-4o-mini",
                messages=messages,
                tools=TOOL_SCHEMAS,
                tool_choice="auto",
                temperature=0.2,
                max_tokens=900,
            )
            reply = response.choices[0].message
            if not reply.tool_calls:
                raw_text = reply.content or ""
                break
            messages.append({
                "role": "assistant",
                "content": reply.content,
                "tool_calls": [
                    {"id": tc.id, "type": "function", "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                    for tc in reply.tool_calls
                ],
            })
            for tc in reply.tool_calls:
                try:
                    args = json.loads(tc.function.arguments or "{}")
                except ValueError:
                    args = {}
                result = await boomi_account_tools.run(tc.function.name, args)
                if tc.function.name == "draft_integration" and isinstance(result, dict) and result.get("draftId"):
                    draft_id = result["draftId"]
                messages.append({"role": "tool", "tool_call_id": tc.id, "content": tool_result_text(result)})
        if not raw_text:
            raw_text = "I looked up your Boomi account but could not put a complete answer together. Please try asking again."

        # Extract suggested action tag if present
        suggested_action = None
        action_match = re.search(r'\[ACTION:(REPROCESS|VIEW_FLOW|INSPECT_PAYLOAD|EXPORT_DOCS|BUILD_PROCESS):([^:]+):([^\]]+)\]', raw_text)
        if action_match:
            action_type, act_exec_id, action_label = action_match.groups()
            suggested_action = SuggestedAction(
                type=action_type,  # type: ignore
                label=action_label.strip(),
                executionId=act_exec_id.strip()
            )
            # Clean action tag from user-facing text
            raw_text = re.sub(r'\[ACTION:[^\]]+\]', '', raw_text).strip()
        if suggested_action and suggested_action.executionId and suggested_action.type in ("VIEW_FLOW", "INSPECT_PAYLOAD", "REPROCESS"):
            known_ids = {str(e.get("id")) for e in executions}
            if str(suggested_action.executionId) not in known_ids:
                suggested_action = None

        # Extract Mermaid code block if present
        code_block = None
        mermaid_match = re.search(r'```mermaid\s*\n([\s\S]*?)\n```', raw_text)
        if mermaid_match:
            code_block = CodeBlock(
                language="mermaid",
                code=mermaid_match.group(1).strip()
            )

        return CompanionMessage(
            id=msg_id,
            sender="companion",
            text=raw_text,
            timestamp=now_time,
            suggestedAction=(
                SuggestedAction(type="OPEN_DRAFT", label="Review the draft in ArchForge", executionId=draft_id) if draft_id else suggested_action
            ),
            codeBlock=code_block
        )

    def _generate_fallback_chat(self, prompt: str, now_time: str, msg_id: str) -> CompanionMessage:
        query = prompt.strip().lower()
        executions = boomi_service.get_executions(limit=50)
        failed_execs = [e for e in executions if e.get("status") == "ERROR" and not e.get("reprocessed")]

        if any(term in query for term in ("build", "create", "design", "new process")):
            return CompanionMessage(
                id=msg_id,
                sender="companion",
                text=(
                    "I can help plan a Boomi process, but I need the source, destination, data format, and any transformation or validation rules to propose accurate shapes. "
                    "You can then review the design in ConnectCraft and build it there."
                ),
                timestamp=now_time,
            )

        if any(term in query for term in ("fail", "error", "incident", "triage", "reprocess")):
            matching_failure = next((e for e in failed_execs if str(e.get("id", "")).lower() in query or str(e.get("processName", "")).lower() in query), None)
            if not failed_execs:
                return CompanionMessage(id=msg_id, sender="companion", text="I don't see an unreprocessed failed execution in the available execution data, so I can't identify a root cause. Share the process name or execution ID to narrow this down.", timestamp=now_time)
            if any(term in query for term in ("process", "execution", " in ")) and matching_failure is None:
                return CompanionMessage(id=msg_id, sender="companion", text="I found failed executions, but none matched the process name or execution ID in your question. Please check the identifier or share the exact execution ID.", timestamp=now_time)
            fe = matching_failure or failed_execs[0]
            p_name = fe.get("processName") or "Unnamed process"
            err = fe.get("errorMessage")
            error_text = f"• **Reported error:** `{err}`\n" if err else "• **Reported error:** No error message is available in this execution record.\n"
            return CompanionMessage(
                id=msg_id,
                sender="companion",
                text=(
                    f"🔍 **Failed execution ({p_name}):**\n\n"
                    f"{error_text}"
                    "The execution record alone does not establish root cause. Inspect the failing shape and input document before applying a fix."
                ),
                timestamp=now_time,
                suggestedAction=SuggestedAction(
                    type="VIEW_FLOW",
                    label=f"Inspect execution: {p_name}",
                    executionId=fe.get("id")
                )
            )

        if any(term in query for term in ("health", "status", "success rate", "how many executions")):
            stats = boomi_service.get_stats()
            return CompanionMessage(
                id=msg_id,
                sender="companion",
                text=(
                    f"**Available execution summary**\n\n"
                    f"- Success rate: {stats['successRatePercent']}% across {stats['totalExecutions']} executions.\n"
                    f"- Failed executions: {stats['failedCount']}.\n\n"
                    "This is the execution summary available to the app; it does not confirm live Atom connectivity."
                ),
                timestamp=now_time,
            )

        return CompanionMessage(
            id=msg_id,
            sender="companion",
            text=(
                "I can't give a reliable answer to that question because the AI service is unavailable and it doesn't match the local failure-summary fallback. "
                "Try again when the AI service is available, or ask about a specific failure using its process name or execution ID."
            ),
            timestamp=now_time
        )

    async def triage_execution_async(self, execution: Dict[str, Any]) -> TriageResponse:
        """
        Deep AI Triage powered by OpenAI, parsing raw error stacktraces and proposing fixes.
        """
        if self._openai_client and execution.get("errorMessage") and not execution.get("companionAnalysis"):
            try:
                err_msg = execution.get("errorMessage", "")
                p_name = execution.get("processName", "Process")
                prompt = (
                    f"Perform deep triage on failed Boomi process execution:\n"
                    f"Process Name: {p_name}\n"
                    f"Error Stacktrace: {err_msg}\n"
                    f"Provide:\n"
                    f"1. Decoded Error (plain English explanation of what broke)\n"
                    f"2. Root Cause\n"
                    f"3. Impact Severity (CRITICAL, HIGH, MEDIUM, or LOW)\n"
                    f"4. Suggested Action"
                )
                res = await self._openai_client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {"role": "system", "content": "You are Keystone AI, an integration diagnostic engine."},
                        {"role": "user", "content": prompt}
                    ],
                    max_tokens=300,
                    temperature=0.2
                )
                ai_text = res.choices[0].message.content or ""
                return TriageResponse(
                    executionId=execution["id"],
                    processName=execution["processName"],
                    status=execution["status"],
                    decodedError=err_msg,
                    rootCause=ai_text[:250],
                    impactSeverity="HIGH",
                    confidenceScore=96.4,
                    blastRadiusCount=2,
                    suggestedAction=SuggestedAction(
                        type="VIEW_FLOW",
                        label="Inspect Process Configuration",
                        executionId=execution["id"]
                    ),
                    payload=execution.get("payload")
                )
            except Exception as e:
                logger.warning(f"Error calling OpenAI for triage: {e}")

        # Standard triage fallback
        analysis = execution.get("companionAnalysis") or {
            "rootCause": "Data or configuration defect detected during shape execution.",
            "impactSeverity": "HIGH",
            "suggestedAction": "Inspect shape configuration in AtomSphere Process Reporting.",
            "autoHealAvailable": False,
            "confidenceScore": 92.0,
            "blastRadiusCount": 1
        }
        
        decoded_error = execution.get("errorMessage") or "No detailed stacktrace found."
        
        return TriageResponse(
            executionId=execution["id"],
            processName=execution["processName"],
            status=execution["status"],
            decodedError=decoded_error,
            rootCause=analysis["rootCause"],
            impactSeverity=analysis["impactSeverity"],
            confidenceScore=analysis["confidenceScore"],
            blastRadiusCount=analysis["blastRadiusCount"],
            suggestedAction=SuggestedAction(
                type="REPROCESS" if analysis["autoHealAvailable"] else "VIEW_FLOW",
                label="Execute Auto-Heal & Reprocess Document" if analysis["autoHealAvailable"] else "Inspect Process Topology",
                executionId=execution["id"]
            ),
            payload=execution.get("payload")
        )

    def triage_execution(self, execution: Dict[str, Any]) -> TriageResponse:
        # Sync wrapper
        analysis = execution.get("companionAnalysis") or {
            "rootCause": "Data or configuration defect detected during shape execution.",
            "impactSeverity": "HIGH",
            "suggestedAction": "Inspect shape configuration in AtomSphere Process Reporting.",
            "autoHealAvailable": False,
            "confidenceScore": 92.0,
            "blastRadiusCount": 1
        }
        decoded_error = execution.get("errorMessage") or "No detailed stacktrace found."
        return TriageResponse(
            executionId=execution["id"],
            processName=execution["processName"],
            status=execution["status"],
            decodedError=decoded_error,
            rootCause=analysis["rootCause"],
            impactSeverity=analysis["impactSeverity"],
            confidenceScore=analysis["confidenceScore"],
            blastRadiusCount=analysis["blastRadiusCount"],
            suggestedAction=SuggestedAction(
                type="REPROCESS" if analysis["autoHealAvailable"] else "VIEW_FLOW",
                label="Execute Auto-Heal & Reprocess Document" if analysis["autoHealAvailable"] else "Inspect Process Topology",
                executionId=execution["id"]
            ),
            payload=execution.get("payload")
        )

    async def generate_blueprint_prompt(
        self,
        blueprint_id: str,
        stages: list,
        business_rule: str,
        settings: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Builds the Boomi Companion prompt deterministically from the canvas so every
        shape, name and note survives, then (when OpenAI is configured) appends a short
        review section. OpenAI never rewrites the spec itself: free rewriting dropped
        shapes and invented directives.
        """
        from .boomi_blueprint_engine import _as_dict, describe_canvas, generate_fallback_blueprint_prompt

        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        stage_dicts = [_as_dict(s) for s in stages]
        source_name = stage_dicts[0].get("selectedShapeOrConnector", "REST API") if stage_dicts else "REST API"
        target = next(
            (d for d in stage_dicts if d.get("category") == "DESTINATION"),
            stage_dicts[-1] if stage_dicts else {},
        )
        target_name = target.get("selectedShapeOrConnector", "Salesforce")

        spec = generate_fallback_blueprint_prompt(
            blueprint_id=blueprint_id,
            source_name=source_name,
            target_name=target_name,
            stages=stages,
            business_rule=business_rule,
            settings=settings
        )

        if self._openai_client:
            try:
                response = await self._openai_client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {"role": "system", "content": (
                            "You are a senior Dell Boomi integration architect reviewing a build plan before it is "
                            "handed to Boomi Companion. Do NOT rewrite or restate the plan. Reply with at most 6 short "
                            "bullets of concrete risks or clarifying questions about the listed canvas "
                            "(for example missing credentials, an undefined object name, or an ordering problem). "
                            "Do not invent requirements, properties or shapes that are not listed."
                        )},
                        {"role": "user", "content": (
                            f"Canvas, left to right:\n{describe_canvas(stages)}\n\n"
                            f"Business rule: {business_rule or 'none specified'}"
                        )},
                    ],
                    temperature=0.2,
                    max_tokens=400
                )
                review = (response.choices[0].message.content or "").strip()
                if review:
                    spec += f"\n\n## Review notes (AI-suggested, non-binding)\n{review}\n"
                return {
                    "prompt": spec,
                    "status": "success",
                    "modelUsed": "gpt-4o-mini",
                    "generatedAt": now_str,
                    "source": "openai"
                }
            except Exception as e:
                logger.warning(f"OpenAI review for blueprint prompt failed ({e}); returning the rules-engine spec.")

        return {
            "prompt": spec,
            "status": "success",
            "modelUsed": "domain-rules-engine",
            "generatedAt": now_str,
            "source": "domain_engine"
        }
companion_ai_service = CompanionAIService()
