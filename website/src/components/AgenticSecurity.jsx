import { AgentGateway, AgentKill, AgentsDirectory, AgentsFound, Feature } from './showcase.jsx';

/* Agentic AI security: the four questions every security team now asks
   about AI agents, each answered with a picture of Zenstra doing it.
   Used on the home page and the Zenstra page. */
export default function AgenticSecurity({ head = true, rows = ['find', 'govern', 'run', 'stop'] }) {
  const on = (k) => rows.includes(k);
  return (
    <div className="sc-agentic">
      {head && (
        <div className="wrap sc-intro">
          <p className="sc-eyebrow">Agentic AI security</p>
          <h2 className="sc-title">Every AI agent found, owned and kept in bounds.</h2>
          <p className="sc-lead">Agents now act with real credentials across your business. Zenstra gives each one an identity, an owner and a scope, and stops it the moment it steps outside.</p>
        </div>
      )}
      {on('find') && <Feature id="ag-find" eyebrow="Where are my agents?" title="Find and register every agent" lead="Discover agents from browsers and laptops to cloud platforms. Bring them into one directory, alongside the agents from each platform and identity provider, and give each one a human owner.">
        <AgentsFound />
      </Feature>}
      {on('govern') && <Feature id="ag-govern" flip eyebrow="What can they do?" title="Govern agents from creation to retirement" lead="Hold every agent to least privilege across each connection it makes, and keep its access honest with regular owner reviews.">
        <AgentsDirectory />
      </Feature>}
      {on('run') && <Feature id="ag-run" flip={!on('govern')} eyebrow="What are they doing?" title="Check every tool call at runtime" lead="Put identity, policy and a record in the path of every tool call. Watch access as it happens, to stop data leaving and prompt injection taking hold.">
        <AgentGateway />
      </Feature>}
      {on('stop') && <Feature id="ag-stop" flip eyebrow="How do I respond?" title="Stop a rogue agent in seconds" lead="Respond the moment an agent goes wrong. One switch revokes its access everywhere, with a full record for your auditors.">
        <AgentKill />
      </Feature>}
    </div>
  );
}
