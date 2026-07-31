# Carbonio AI Assistant

Standalone AI assistant add-on for Carbonio Webmail. The project keeps the
Carbonio microfrontend and the AI Agent Gateway separate from the existing Mail
module.

## Repository structure

- `src/` — React/TypeScript Carbonio microfrontend
- `gateway/` — server-side AI provider, mailbox tools, and history service

## Features

- AI Assistant button in Carbonio's primary navigation
- Chat interface with server-side conversation history
- History isolation using the authenticated Carbonio account ID
- Persistent SQLite storage
- Carbonio SOAP tools for searching and reading email
- Provider presets for OpenRouter, OpenAI, Anthropic, DeepSeek, and Gemini
- Custom agent endpoint support
- Per-conversation model selection
- Server-Sent Events for streamed UI responses

## Requirements

- Node.js 22
- pnpm 10
- A running Carbonio Mailbox development server
- Carbonio Shell UI configured to load this microfrontend

## Run the microfrontend

```bash
pnpm install
pnpm exec sdk watch -h 127.0.0.1:8443 -p 9002 -s
```

## Run the gateway

```bash
cd gateway
node src/server.js
```

The gateway binds to `127.0.0.1:8787` by default. Carbonio Shell should proxy
`/api/ai/**` to this address.

## Security notes

- Provider API keys are never returned to the browser.
- Runtime configuration and SQLite history are stored under
  `gateway/.runtime/` and excluded from Git.
- Conversation access is scoped with the active Carbonio session and account
  ID.
- Mailbox tools are read-only in this prototype.
- Production deployments should use an external secret manager and a supported
  production database.

## Development status

This repository is an MVP intended for local testing and further integration
work. Review authentication, authorization, database operations, auditing, and
provider data-retention policies before production use.

## License

This project is licensed under the [MIT License](LICENSE).
