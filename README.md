# Carbonio AI Assistant

Standalone AI assistant add-on for Carbonio Webmail. The project keeps the
Carbonio microfrontend and the AI Agent Gateway separate from the existing Mail
module.

Current release: [`v1.0.0-beta.1`](docs/releases/v1.0.0-beta.1.md), a prerelease
for controlled Carbonio pilot deployments.

![Carbonio AI Assistant interface](docs/assets/carbonio-ai-assistant-overview.png)

## Repository structure

- `src/` — React/TypeScript Carbonio microfrontend
- `gateway/` — server-side AI provider, mailbox tools, and history service

## Features

- AI Assistant button in Carbonio's primary navigation
- Chat interface with server-side conversation history
- Carbonio-aware English and Indonesian localization
- ChatGPT-style history rows with hover actions, rename, and delete
- Soft-delete with Undo, title search, and cursor-based conversation pagination
- History isolation using the authenticated Carbonio account ID
- PostgreSQL production history with normalized messages and AES-256-GCM content encryption
- Carbonio SOAP tools for searching and reading email
- Bounded single-message and conversation reads using Carbonio `GetMsg` and `GetConv`
- AI-generated email draft preview with explicit one-time confirmation before `SaveDraft`
- Calendar search, attendee free/busy checks, and confirmed appointment creation
- Schema-based tool permissions, audit records, result limits, and idempotency protection
- Provider presets for OpenRouter, OpenAI, Anthropic, DeepSeek, and Gemini
- Administrator-only provider settings and fail-closed custom endpoint allowlisting
- Per-conversation model selection
- Provider/model allowlists, account quotas, cross-site request checks, and write-tool kill switch
- Correlated request IDs, structured JSON logs, provider retry, and bounded timeouts
- Citation-backed documentation RAG for the official Carbonio email SOAP API
- Real-time, localized process markers for documentation, mailbox, and AI activity
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
- Global provider settings require an account listed in `AI_ADMIN_ACCOUNTS`; an empty
  admin list grants no user administrative access.
- Runtime configuration, audit data, and local-development SQLite history are stored
  under `gateway/.runtime/` and excluded from Git. Production conversation history uses
  a dedicated PostgreSQL database.
- Conversation access is scoped with the active Carbonio session and account
  ID.
- Read tools never mark email as read. Email draft, send, mark-read, tag, move, and delete
  mutations require a one-time account-bound confirmation token and idempotency key;
  permanent delete is presented as a destructive action.
- Calendar create, draft, update, invitation, and cancellation flows show bounded previews.
  Updates use Carbonio `ms`/`rev` conflict detection and display field changes; attendee
  invitations and cancellation always require explicit confirmation.
- Production deployments should use an external secret manager and a supported
  production database.

## Development status

`v1.0.0-beta.1` contains the complete core production-pilot feature set, but it is not a
stable `v1.0.0` declaration. Review the [detailed beta release report](docs/releases/v1.0.0-beta.1.md)
for verified behavior, the full closed-bug ledger, live UAT evidence, and remaining gates.
Complete the documented browser, mailbox-size, calendar-mutation, upgrade, staging,
backup, and pilot-approval gates before expanding beyond the configured allowlist.

## License

This project is licensed under the [MIT License](LICENSE).
