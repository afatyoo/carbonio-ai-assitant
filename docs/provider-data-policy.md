# AI Provider Data Policy Review

Reviewed: 2026-08-02

## Production pilot decision

The pilot is restricted to `openrouter/free` and enforces these routing preferences
on every completion request:

```json
{
  "provider": {
    "data_collection": "deny",
    "zdr": true
  }
}
```

OpenRouter documents that `data_collection: "deny"` restricts routing to providers
that do not collect user data, while `zdr: true` restricts routing to endpoints with
Zero Data Retention. OpenRouter also states that it does not retain prompt/response
content unless input/output logging is explicitly enabled. Model-provider policies
can differ by endpoint, so the per-request restrictions are mandatory for mailbox
content rather than relying only on an account-wide setting.

Operational requirements:

- Keep OpenRouter Input & Output Logging disabled for the production API key.
- Keep OpenRouter use of inputs/outputs disabled.
- Use a dedicated organization/API key with its own budget and guardrail.
- Do not disable `AI_OPENROUTER_DENY_DATA_COLLECTION` or `AI_OPENROUTER_ZDR`
  without a documented privacy review.
- Production mode locks both routing controls to `data_collection: "deny"` and
  `zdr: true`; environment overrides can relax them only outside production.
- The free router is suitable for functional testing, not for an SLA-backed rollout.
  Move production users to an explicitly selected approved model/provider or a
  self-hosted OpenAI-compatible endpoint.
- The gateway sends only bounded task context and redacts common secret patterns;
  users still receive a disclosure because email content can contain personal data.

## Official references

- [OpenRouter Zero Data Retention](https://openrouter.ai/docs/guides/features/zdr)
- [OpenRouter provider routing controls](https://openrouter.ai/docs/guides/routing/provider-selection)
- [OpenRouter data collection](https://openrouter.ai/docs/guides/privacy/data-collection)
- [OpenRouter privacy policy](https://openrouter.ai/privacy/)
- [OpenRouter input/output logging](https://openrouter.ai/docs/guides/features/input-output-logging)
