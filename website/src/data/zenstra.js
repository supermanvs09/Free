/* The six Zenstra AI capabilities. Each is its own page (layout 'capability')
   with its own illustration (components/visuals/CapVisuals.jsx). Statements
   describe the product design; no customer results are claimed. */

const P = '/agentic-ai/agentic-identity';
const base = { line: 'Zenstra AI', parent: P, layout: 'capability', theme: 'agents' };

export const ZCAPS = {
  zdiscovery: {
    ...base, path: '/agentic-ai/agent-discovery', name: 'Agent Discovery', icon: 'MagnifyingGlass', kind: 'discovery', short: 'Find every agent, including the shadow ones',
    seoTitle: 'Agent Discovery: Find Every AI Agent in Your Enterprise | Zenstra AI',
    description: 'Zenstra Agent Discovery finds custom, third-party and employee-built AI agents across cloud, workflow tools and staff devices, then shows who owns each one and what it can reach.',
    hero: { lead: 'You cannot secure an agent', accent: 'you have not found', sub: 'Zenstra scans your platforms and builds one inventory of every AI agent, with its owner, its platform and what it can reach.' },
    steps: [['Connect', 'Read-only connections to Copilot Studio, Claude, Cursor, n8n, LangGraph and your cloud accounts.'], ['Scan', 'Agents are found by what they are and what they touch, not by who registered them.'], ['Assign', 'Agents with no owner are flagged, assigned and ranked by access and behaviour.']],
    gains: [['Shadow agents surface', 'Agents built by employees on their own appear in the same list as the ones IT approved.'], ['Risk in context', 'Each agent shows the systems and data it can reach, so the riskiest are obvious.'], ['An owner for each', 'No agent stays anonymous. Unowned agents are a task, not a surprise.']],
    research: ['ai-agent-governance', 'ai-security-intelligence'],
  },
  zidentity: {
    ...base, path: '/agentic-ai/agent-access', name: 'Agent Identity and Access', icon: 'Fingerprint', kind: 'identity', short: 'An owner, a purpose and short-lived access',
    seoTitle: 'Agent Identity and Access: Scoped, Short-Lived AI Agent Access | Zenstra AI',
    description: 'Zenstra gives every AI agent an owner, a declared purpose and short-lived scoped access that expires with the task, so a stolen token or a wrong prompt cannot reach further than the job.',
    hero: { lead: 'Give every agent a job,', accent: 'not the keys', sub: 'Each agent gets an owner, a declared task and access that expires with it. Standing permissions go away.' },
    steps: [['Declare', 'The owner states what the agent is for and which systems it may use.'], ['Grant', 'Zenstra issues the narrowest access for that task and no more.'], ['Expire', 'Access ends with the task. Renewal needs the owner, not the agent.']],
    gains: [['Least privilege by default', 'Wildcard roles and long-lived keys are replaced with grants sized to the task.'], ['Accountable ownership', 'Every agent maps to a person who answers for it.'], ['Explained risk', 'A plain-language analysis shows why an agent is risky and what to change.']],
    research: ['ai-agent-governance', 'identity-security'],
  },
  zenforce: {
    ...base, path: '/agentic-ai/runtime-enforcement', name: 'Runtime Enforcement', icon: 'ShieldCheck', kind: 'enforce', short: 'Allow, block, contain or ask, inline',
    seoTitle: 'Runtime Enforcement: Check Every AI Agent Action Before It Runs | Zenstra AI',
    description: 'A Zenstra gateway inside your VPC checks each AI agent tool call against its declared task and grant, then allows, blocks, contains or asks a human, in milliseconds.',
    hero: { lead: 'Check every action', accent: 'before it runs', sub: 'A gateway in your own cloud compares each tool call with the agent’s task and grant, then allows, blocks or asks a person.' },
    steps: [['Intercept', 'Tool calls pass through the gateway. Agents are not rewritten.'], ['Decide', 'Each call is checked against the task, the grant and your policy.'], ['Act', 'Allow, block, contain the agent or send the call to a named approver.']],
    gains: [['Decisions in milliseconds', 'Checks run inline, so agents keep their speed.'], ['Human approval where it counts', 'High-impact actions wait for a person, with the context to decide.'], ['Payloads stay with you', 'The gateway runs in your VPC. Prompts and data do not leave your cloud.']],
    research: ['ai-security', 'ai-agent-governance'],
  },
  zmcp: {
    ...base, path: '/agentic-ai/mcp-security', name: 'MCP Security', icon: 'PlugsConnected', kind: 'mcp', short: 'Trust MCP servers on purpose',
    seoTitle: 'MCP Security: Allow-List and Monitor MCP Servers | Zenstra AI',
    description: 'Zenstra MCP Security allow-lists MCP servers per agent, flags unofficial servers and holds any tool whose definition changes after approval, before an agent can call it.',
    hero: { lead: 'Every MCP server is code', accent: 'an agent will trust', sub: 'Approve MCP servers per agent, spot unofficial ones, and stop a tool that quietly changes after you approved it.' },
    steps: [['Inventory', 'Every MCP server in use is listed with its source and the agents that call it.'], ['Approve', 'Owners allow-list servers and tools per agent. Everything else is blocked.'], ['Watch', 'A changed tool definition is held for review before any agent calls it.']],
    gains: [['Official or not, visible', 'Unofficial servers are marked and kept out by default.'], ['Changes do not slip through', 'A tool that changes after approval is held, with the difference shown.'], ['Per-agent scope', 'An agent only sees the tools it needs for its task.']],
    research: ['ai-security-intelligence', 'ai-security'],
  },
  zdetect: {
    ...base, path: '/agentic-ai/detection-response', name: 'Detection and Response', icon: 'Pulse', kind: 'detect', short: 'Catch misuse of legitimate access',
    seoTitle: 'Detection and Response for AI Agents | Zenstra AI',
    description: 'Zenstra learns each AI agent’s normal behaviour, flags activity outside its task even when access is legitimate, and contains the agent with evidence for its owner.',
    hero: { lead: 'Legitimate access can still be', accent: 'misused', sub: 'Zenstra learns what each agent normally does and acts when it steps outside its task, even with valid credentials.' },
    steps: [['Learn', 'A behaviour baseline per agent: tools, volumes, destinations and timing.'], ['Spot', 'Departures from the baseline and from the declared task are scored and explained.'], ['Contain', 'Tokens are revoked or the agent paused, and the owner gets the evidence.']],
    gains: [['Beyond permissions', 'Catches misuse that an access check alone would allow.'], ['Fast containment', 'Response steps run by policy, with a person kept in the loop.'], ['Evidence attached', 'Owners see what happened, in what order and why it was flagged.']],
    research: ['threat-intelligence', 'ai-security-intelligence'],
  },
  zrecord: {
    ...base, path: '/agentic-ai/decision-record', name: 'Decision Record', icon: 'ClipboardText', kind: 'record', short: 'A record your auditor can read',
    seoTitle: 'Decision Record: Audit Evidence for AI Agent Actions | Zenstra AI',
    description: 'Zenstra records every agent action, the policy applied and the outcome in a tamper-evident chain, ready for SOC 2, ISO/IEC 42001 and DPDPA questions.',
    hero: { lead: 'Prove what your agents did,', accent: 'and why', sub: 'Every decision is recorded with the agent, the task, the policy and the outcome, in a chain that shows tampering.' },
    steps: [['Record', 'Each decision is written as it happens, with the policy that produced it.'], ['Chain', 'Entries are linked so any edit or gap is visible.'], ['Export', 'Package evidence for auditors and regulators in one step.']],
    gains: [['One line per decision', 'Agent, action, policy and outcome read together.'], ['Tamper-evident', 'A broken chain is detected, not hidden.'], ['Audit-ready', 'Built around the questions SOC 2, ISO/IEC 42001 and DPDPA reviews ask.']],
    research: ['ai-agent-governance', 'ai-security'],
  },
};
