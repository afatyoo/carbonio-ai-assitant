# AI Account, Model, and Tool Policy

The gateway keeps the global provider configuration separate from each account's
preferred model. Only `AI_ADMIN_ACCOUNTS` can change provider URL, key, and global
defaults. Every authenticated account can save a preferred model, but the gateway
accepts it only when the effective model policy allows it.

## Scoped model policy

`AI_MODEL_POLICY_JSON` is a JSON object. Selectors use this precedence:

1. `account:<Carbonio account ID or email>`
2. `group:<Carbonio distribution-list address>`
3. `domain:<mail domain>`
4. `*`
5. `AI_MODEL_ALLOWLIST` when no scoped selector matches

Example:

```ini
AI_MODEL_ALLOWLIST=openrouter/free
AI_MODEL_POLICY_JSON='{"account:admin@example.com":["openrouter/free","openai/gpt-5.4-mini"],"group:ai-premium@example.com":["openrouter/free","openai/gpt-5.4-mini"],"domain:example.com":["openrouter/free"],"*":["openrouter/free"]}'
```

## Scoped tool permission policy

Supported permissions are:

- `mail.read`
- `mail.draft`
- `mail.write`
- `calendar.read`
- `calendar.write`
- `contacts.read`
- `contacts.write`
- `sharing.read`
- `sharing.write`
- `preferences.read`
- `preferences.write`
- `tasks.read`
- `tasks.write`

Example:

```ini
AI_TOOL_PERMISSION_POLICY_JSON='{"group:ai-writers@example.com":["mail.read","mail.draft","calendar.read","calendar.write"],"domain:example.com":["mail.read","calendar.read"],"*":["mail.read"]}'
```

The global write kill switch and `AI_WRITE_TOOL_ACCOUNTS` remain authoritative:
a scoped policy cannot re-enable write access disabled by either control.

The Safety Center runtime write stop is also authoritative beneath the environment switch.
Administrators can stop writes without changing the service environment. Re-enabling from the UI
is refused while `AI_WRITE_TOOLS_ENABLED=false`.

## Provider fallback policy

`AI_MODEL_FALLBACKS` is an ordered comma-separated list. Every candidate must pass the same
effective model allowlist as the primary model. `AI_MODEL_FALLBACK_ENABLED=false` disables the
chain. Fallback is limited to retryable provider availability conditions and never bypasses
authentication, authorization, invalid-input, privacy, or cancellation failures.

Group membership is resolved with the authenticated user's Carbonio session through
[`GetAccountDistributionLists`](https://docs.zextras.com/apidoc/api-reference/zimbraAccount/GetAccountDistributionLists.html).
Results are cached briefly according to `AI_GROUP_CACHE_TTL_MS`; no administrator
credential or group member list is sent to the AI provider.

## Per-account usage

Daily request and token limits are controlled by:

```ini
AI_REQUESTS_PER_DAY=500
AI_TOKENS_PER_DAY=250000
```

Input and output usage is stored owner-scoped in PostgreSQL. Provider-reported usage
is preferred; when a provider omits usage metadata the gateway records a conservative
character-based estimate. An account can read only its own usage at
`GET /api/ai/usage`.
