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
- Do not disable ZDR without a documented privacy review and explicit risk acceptance in the
  port 6071 AI Administration page. `data_collection: "deny"` remains enforced in production.
- ZDR defaults to enabled. An authenticated global Carbonio administrator can disable it when
  a testing model has no ZDR-compatible endpoint. The gateway stores the acceptance time and
  sends `zdr: false` until it is re-enabled.
- Set `AI_OPENROUTER_ZDR_LOCKED=true` to lock the environment-selected ZDR value and disable
  the runtime control.
- The free router is suitable for functional testing, not for an SLA-backed rollout.
  Move production users to an explicitly selected approved model/provider or a
  self-hosted OpenAI-compatible endpoint.
- The gateway sends only bounded task context and redacts common secret patterns;
  users still receive a disclosure because email content can contain personal data.
- Every configured fallback model must meet the same retention, training, regional processing,
  contractual, and allowlist requirements as the primary model. A successful fallback remains
  visibly reported as degraded provider state.
- Treat `PROVIDER_PRIVACY_POLICY_MISMATCH` as a configuration incident. The gateway does not
  retry that failure through another model.

## Official references

- [OpenRouter Zero Data Retention](https://openrouter.ai/docs/guides/features/zdr)
- [OpenRouter provider routing controls](https://openrouter.ai/docs/guides/routing/provider-selection)
- [OpenRouter data collection](https://openrouter.ai/docs/guides/privacy/data-collection)
- [OpenRouter privacy policy](https://openrouter.ai/privacy/)
- [OpenRouter input/output logging](https://openrouter.ai/docs/guides/features/input-output-logging)
