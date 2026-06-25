import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { config } from '../config.js';
import { createError } from '../middleware/errorHandler.js';
import { dbGet } from '../database/index.js';
import { aiToolSchemas, executeTool } from '../services/aiTools.js';

const router = Router();

router.post('/chat', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { message, history } = req.body;
        if (!message) throw createError('Message is required', 400);

        console.log(`[AI] Chat request from ${req.user?.username}: ${message}`);

        try {
            const systemContext = `You are VersAgent AI, an intelligent IT assistant for the VersAgent platform.
You have two roles:
1. Expert IT support engineer — help troubleshoot PCs, networks, write scripts, solve technical problems.
2. Database analyst — you MUST use the run_sql_query tool to answer ANY question about data. You HAVE DIRECT, LIVE ACCESS to the production database via this tool.

CRITICAL — TOOL USAGE:
- You have FULL and DIRECT ACCESS to the database via the run_sql_query tool. You are NOT simulated. You CAN run queries.
- You CANNOT answer questions about machines, users, incidents, tasks, printers, or any live data WITHOUT calling run_sql_query first.
- If you answer a data question without calling the tool, your answer will be WRONG. Always call the tool immediately.
- NEVER ask the user for permission to query the database. Just DO it.
- NEVER say "Would you like me to proceed" or "I can query our internal database". Execute the tool immediately.
- If the tool returns an error, call it AGAIN with a corrected query. Do not stop — retry silently.

DATABASE SCHEMA (MS SQL Server — T-SQL syntax, use EXACT column names):

TABLE: machines
  id, hostname, serial_number, is_managed (BIT), is_archived (BIT), agent_id, agent_version,
  os_name, os_version, os_build, operating_system, cpu, ram_gb (FLOAT), disk_gb (FLOAT),
  [current_user], last_heartbeat (DATETIME2), last_inventory (DATETIME2), last_seen (DATETIME2),
  status ('online'|'offline'), active (BIT), block_reason, created_at, updated_at

TABLE: machine_metadata  — JOIN ON machines.id = machine_metadata.machine_id
  machine_id, category ('User'|'Shopfloor'|'Server'|'Kiosk'|'Network'|'Unassigned'),
  location, department, family, description, tags, notes, updated_at

TABLE: network_interfaces  — JOIN ON machines.id = network_interfaces.machine_id
  id, machine_id, mac_address, ip_address, interface_name, vlan_id, vlan_name,
  switch_name, switch_ip, switch_port, switch_platform, mapping_source,
  dns_servers, default_gateway, allow_overwrite (BIT), last_refreshed, created_at, updated_at

TABLE: incidents
  id, title, description, status ('Open'|'In Progress'|'Resolved'|'Closed'),
  priority, machine_id, assigned_to (user id), created_by (user id), closed_at, created_at, updated_at

TABLE: users
  id, username, full_name, title, role ('SuperAdmin'|'Admin'|'Viewer'),
  email, is_active (BIT), last_login (DATETIME2), created_at, updated_at
  NOTE: users has NO 'last_seen' column. For "logged in today": last_login >= CAST(GETDATE() AS DATE)

TABLE: tasks
  id, title, description, importance_level ('Low'|'Medium'|'High'|'Critical'),
  status ('On Going'|'On Hold'|'Closed'), start_date, end_date, created_by, created_at, updated_at

TABLE: task_assignments (task_id, user_id)
TABLE: task_subtasks (task_id, title, is_completed BIT, description)
TABLE: task_comments (task_id, user_id, content, subtask_id)

TABLE: printers
  id, ip_address, category, department, mac_address, serial_number,
  hostname, model, queue_name, station_name, line, comment, created_at, updated_at

TABLE: compliance_rules
  id, name, rule_type, app_name, severity ('warning'|'critical'), is_active (BIT), created_at

TABLE: compliance_results — JOIN ON machine_id + rule_id
  id, machine_id, rule_id, status ('Compliant'|'Non-Compliant'), details, last_checked

TABLE: installed_apps — JOIN ON machine_id
  id, machine_id, app_name, version, publisher, install_date, scope, created_at

TABLE: machine_vulnerabilities — JOIN ON machine_id + cve_id
  id, machine_id, cve_id, app_name, app_version, detected_at

TABLE: cve_cache
  cve_id, description, cvss_score (FLOAT), severity, published_date, updated_at

TABLE: alerts
  id, machine_id, user_id, alert_type, severity, title, message, link, is_read (BIT), created_at

TABLE: audit_logs
  id, user_id, username, action, entity_type, entity_id, old_value, new_value, ip_address, timestamp

TABLE: switch_inventory
  id, name, ip_address, snmp_version, snmp_community, is_active (BIT), last_polled, created_at

TABLE: settings ([key], [value], updated_at)

QUERY RULES:
- Use EXACT column names above. [current_user], [key], [value] must always have square brackets.
- Only SELECT queries — never UPDATE, DELETE, INSERT, DROP, ALTER.
- NEVER use MySQL functions like DATE(), CURDATE(), or NOW().
- ALWAYS use T-SQL functions. To get today's date, you MUST use: CAST(GETDATE() AS DATE)
- "online machines" → WHERE status = 'online'
- "managed machines" → WHERE is_managed = 1
- "logged in today" → WHERE last_login >= CAST(GETDATE() AS DATE)
- For category/department: JOIN machine_metadata ON machines.id = machine_metadata.machine_id

ABSOLUTE OUTPUT RULES — NEVER BREAK:
- NEVER output SQL, code blocks, backticks, or query strings in your reply.
- NEVER say "run this query", "try this SQL", "please execute", or show any code.
- NEVER say "I encountered an error", "there was a typo", or mention query failures.
- NEVER ask the user to do anything technical. Just give them the answer.
- Answer in plain, friendly language only. Numbers, names, summaries — no code.
- If truly no data found, say so naturally (e.g. "No users logged in today.").`;

            let currentMessages: any[] = [
                { role: 'system', content: systemContext },
                ...(history || []),
                { role: 'user', content: message }
            ];

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 300000);

            // Set up SSE streaming headers
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            // Call Ollama API
            const callOllama = async (messages: any[]) => {
                const response = await fetch(`${config.ollamaUrl}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: config.ollamaModel,
                        messages,
                        tools: aiToolSchemas,
                        stream: true,
                        keep_alive: -1,
                        options: { num_ctx: 4096 }
                    }),
                    signal: controller.signal
                });
                if (!response.ok) {
                    const err = await response.json().catch(() => ({})) as any;
                    throw createError('AI Service error: ' + (err.error || response.statusText), 502);
                }
                return response;
            };

            // Drain a streamed Ollama response into content + tool_calls
            const drainStream = async (responseObj: globalThis.Response) => {
                const result = { content: '', tool_calls: [] as any[] };
                if (!responseObj.body) return result;
                let buffer = '';

                for await (const chunk of responseObj.body as any) {
                    buffer += Buffer.from(chunk).toString('utf-8');
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        if (!line.trim()) continue;
                        try {
                            const parsed = JSON.parse(line);
                            if (parsed.message?.tool_calls?.length) {
                                result.tool_calls.push(...parsed.message.tool_calls);
                            }
                            if (parsed.message?.content) {
                                result.content += parsed.message.content;
                            }
                        } catch { /* skip malformed chunk */ }
                    }
                }

                // Fallback: Hermes-3 sometimes outputs tool calls as raw JSON in content
                if (result.tool_calls.length === 0) {
                    const match = result.content.match(/\{[\s\S]*"name"\s*:\s*"[^"]+"[\s\S]*\}/);
                    if (match) {
                        try {
                            const parsed = JSON.parse(match[0]);
                            const args = parsed.parameters || parsed.arguments;
                            if (parsed.name && args !== undefined) {
                                console.log(`[AI] Detected raw-content tool call: ${parsed.name}`);
                                result.tool_calls.push({ function: { name: parsed.name, arguments: args } });
                                // Remove the JSON block from the output text so the user doesn't see it, but keep the conversational text
                                result.content = result.content.replace(match[0], '').trim();
                            }
                        } catch { /* not a tool call */ }
                    }
                    
                    // Second Fallback: Hermes 3 sometimes outputs raw SQL in a markdown block instead of a JSON tool call.
                    if (result.tool_calls.length === 0) {
                        const mdMatch = result.content.match(/```sql[\r\n]+([\s\S]*?)[\r\n]+```/i);
                        if (mdMatch && mdMatch[1]) {
                            const query = mdMatch[1].trim();
                            console.log(`[AI] Detected markdown SQL fallback, converting to tool call: ${query}`);
                            result.tool_calls.push({ function: { name: 'run_sql_query', arguments: { query } } });
                        }
                    }
                }

                return result;
            };

            // Strip any SQL code blocks that leak through despite instructions
            const sanitizeOutput = (text: string): string => {
                return text
                    .replace(/```sql[\s\S]*?```/gi, '')
                    .replace(/```[\s\S]*?```/g, '')
                    .replace(/`[^`]+`/g, '')
                    .trim();
            };

            // ── Agentic loop — up to 5 iterations ─────────────────────────────
            const MAX_ITERATIONS = 5;
            let finalAnswerSent = false;

            for (let i = 0; i < MAX_ITERATIONS; i++) {
                console.log(`[AI] Iteration ${i + 1}/${MAX_ITERATIONS}`);
                
                // Send thinking status to keep SSE alive during long CPU inference
                if (i === 0) {
                    res.write(`data: ${JSON.stringify({ status: 'thinking' })}\n\n`);
                } else {
                    res.write(`data: ${JSON.stringify({ status: 'analyzing' })}\n\n`);
                }

                const response = await callOllama(currentMessages);
                const turn = await drainStream(response);

                if (turn.tool_calls.length === 0) {
                    // No tool call → this is the final answer
                    const clean = sanitizeOutput(turn.content);
                    if (clean) {
                        res.write(`data: ${JSON.stringify({ content: clean })}\n\n`);
                    }
                    finalAnswerSent = true;
                    break;
                }

                // Tool calls detected → execute them and loop back
                console.log(`[AI] ${turn.tool_calls.length} tool call(s) detected`);
                res.write(`data: ${JSON.stringify({ status: 'querying' })}\n\n`);
                currentMessages.push({ role: 'assistant', content: turn.content, tool_calls: turn.tool_calls });

                for (const tc of turn.tool_calls) {
                    const toolName = tc.function?.name || tc.name;
                    const toolArgs = tc.function?.arguments || tc.parameters || {};
                    console.log(`[AI] Executing tool: ${toolName}`, JSON.stringify(toolArgs).slice(0, 200));
                    const result = await executeTool(toolName, toolArgs);
                    console.log(`[AI] Tool result: ${JSON.stringify(result).slice(0, 200)}`);
                    currentMessages.push({ role: 'tool', content: JSON.stringify(result) });

                    if (result.error) {
                        currentMessages.push({ 
                            role: 'system', 
                            content: 'The query failed due to a syntax error or missing table/column. You MUST try again. Remember: Use T-SQL syntax. Do NOT use MySQL functions like DATE(). To get today\'s date, use CAST(GETDATE() AS DATE).' 
                        });
                    } else {
                        currentMessages.push({ 
                            role: 'system', 
                            content: 'You have successfully queried the database. Do NOT call the tool again. Summarize the tool result to the user immediately as a plain text response.' 
                        });
                    }
                }

                // Loop continues — model will now see tool results and the stop/retry instruction
            }

            if (!finalAnswerSent) {
                res.write(`data: ${JSON.stringify({ content: "I wasn't able to retrieve that information right now. Please try again." })}\n\n`);
            }

            clearTimeout(timeout);
            res.end();

        } catch (ollamaError: any) {
            console.error('[AI] Error:', ollamaError.message);
            if (!res.headersSent) {
                if (ollamaError.cause?.code === 'ECONNREFUSED' || ollamaError.cause?.code === 'ENOTFOUND') {
                    next(createError(`Cannot connect to AI service at ${config.ollamaUrl}. Make sure Ollama is running.`, 503));
                } else {
                    next(ollamaError.statusCode ? ollamaError : createError('AI Service error: ' + ollamaError.message, 502));
                }
            } else {
                res.end();
            }
        }
    } catch (error) {
        if (!res.headersSent) next(error);
        else res.end();
    }
});




// Check status of AI service
router.get('/status', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(`${config.ollamaUrl}/api/tags`, { signal: controller.signal });
        clearTimeout(timeout);

        const data = await response.json() as any;
        const models = data.models || [];
        const isModelAvailable = models.some((m: any) => m.name.startsWith(config.ollamaModel));
        
        res.json({
            online: true,
            model: config.ollamaModel,
            modelAvailable: isModelAvailable,
            availableModels: models.map((m: any) => m.name)
        });
    } catch (error: any) {
        res.json({
            online: false,
            error: error.message,
            url: config.ollamaUrl
        });
    }
});

export default router;
