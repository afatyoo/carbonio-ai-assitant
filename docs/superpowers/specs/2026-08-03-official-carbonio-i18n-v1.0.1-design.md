# Official Carbonio i18n v1.0.1 Design

**Date:** 2026-08-03

**Target release:** v1.0.1

## Objective

Extend Carbonio AI Assistant from English and Indonesian to every language officially
included in the current Carbonio Web GUI, while preserving deterministic English fallback,
translation-key completeness, interpolation safety, and the existing production security
and deployment guarantees.

## Supported Locales

The release supports these exact Carbonio locale codes:

| Code | Language |
| --- | --- |
| `en` | English |
| `fr` | French |
| `hi` | Hindi |
| `id` | Indonesian |
| `it` | Italian |
| `pt` | Brazilian Portuguese |
| `ru` | Russian |
| `es` | Spanish |
| `th` | Thai |

The list follows the Carbonio Administration Guide's officially included Web GUI
languages. Community-supported locales are outside v1.0.1 and fall back to English.

## Translation Scope

The canonical English catalog covers every addon-owned user-facing string used by:

- primary navigation and application registration
- conversation history, search, rename, delete, restore, loading, and errors
- chat empty state, composer, model selection, suggestions, retry, and cancellation
- process markers for documentation, mailbox, calendar, tools, and provider generation
- email draft and mutation previews, confirmations, results, warnings, and failures
- calendar draft, create, update, invitation, cancellation, conflict, and result flows
- administrator Settings, provider configuration, usage, health, metrics, and audit views

All nine locale catalogs contain the same flattened key set as English. No supported
locale may depend on an inline English fallback for an addon-owned catalog key.

The following content is not automatically translated:

- provider-generated AI answers
- user-authored prompts, email content, subjects, contact names, tags, and folder names
- Carbonio server messages or provider error text that is not owned by the addon
- official documentation quotations or citations

The UI may wrap external error details in a localized addon-owned message while preserving
the request ID needed for support.

## Catalog Architecture

`i18n/en.json` is the canonical catalog. The existing nested namespaces remain stable:
`app`, `sidebar`, `chat`, `status`, and `settings`. Missing Settings and administration
keys currently supplied only by inline fallbacks are added to the canonical catalog before
translation.

Each supported locale is a static JSON file beside English:

```text
i18n/en.json
i18n/fr.json
i18n/hi.json
i18n/id.json
i18n/it.json
i18n/pt.json
i18n/ru.json
i18n/es.json
i18n/th.json
```

Carbonio Shell loads the active component catalog through its existing
`/i18n/{{lng}}.json` component path. The addon does not call an external translation
service at runtime. An unsupported or missing locale falls back to English without
blocking application registration.

## Translation Quality

v1.0.1 uses a high-quality first translation pass with terminology aligned to Carbonio,
email, calendar, and common AI-provider concepts. It is not presented as native linguistic
review. The release report and README state that native review remains recommended before
a broad production rollout.

Translations preserve meaning and risk strength. In particular, destructive deletion,
sending email, invitations, cancellation, confirmation, privacy, credential, and error
copy must not become softer or ambiguous in another locale.

## Interpolation and Formatting

Every translation preserves the exact placeholder names required by the English value,
including:

- `{{id}}`
- `{{title}}`
- `{{message}}`
- `{{count}}`
- `{{used}}`
- `{{limit}}`

Placeholder order may change to fit the target language, but names and multiplicity must
remain identical. Dates and times continue to use the active resolved locale through
`Intl` and `toLocaleString`. Official v1.0.1 locales do not require right-to-left layout.

## Validation Contract

A dedicated Node.js i18n contract performs these checks:

1. the supported-locale manifest contains exactly the nine official codes
2. every locale file parses as JSON and contains only non-empty string leaves
3. every locale has the same flattened keys as `en.json`
4. every translated value preserves the exact interpolation-token multiset from English
5. every statically discoverable addon translation key in `src/` exists in English
6. explicitly registered dynamic action-result keys exist in English and every locale
7. the production build contains all nine locale files with unchanged JSON content
8. locale switching and unknown-locale English fallback remain covered by the UI contract

The contract produces a useful locale and key name on failure rather than a generic parity
error. It runs locally, in branch CI, and in the tag release workflow.

## Version and Release

The root package, gateway package, and gateway lockfile move together from `1.0.0` to
`1.0.1`. The release adds:

- a CHANGELOG entry
- a stable `docs/releases/v1.0.1.md` report
- README language support and linguistic-review disclosure
- release-contract coverage for exact version, report, locales, and i18n test gates
- a versioned archive, checksum, tag, and GitHub Release produced by the existing workflow

The v1.0.0 tag and public artifact remain immutable. The existing accepted external gates
remain known limitations. v1.0.1 additionally records that the seven newly added locale
catalogs are high-quality first passes without native linguistic sign-off.

After exact-head CI and tag workflow succeed, the public v1.0.1 artifact may be installed on
the Carbonio pilot using the existing backup, checksum, install, smoke, PostgreSQL reconnect,
and authenticated browser verification procedure. Live language switching should be checked
for all nine locales. This release does not expand the pilot account allowlist.

## Documentation

README and release documentation explain:

- which nine locale codes are officially supported by the addon
- that Brazilian Portuguese uses Carbonio code `pt`
- how locale selection follows the Carbonio account preference
- that unsupported community locales fall back to English in v1.0.1
- that AI answers and external content are not automatically translated
- that native linguistic review remains recommended

## Out of Scope

- Carbonio community-supported locales `bs`, `nl`, `de`, `hu`, `ja`, `ky`, `pl`, `sl`,
  `tr`, and `vi`
- runtime machine translation
- automatic translation of AI answers or mailbox content
- right-to-left layout work
- production-ready mailbox or workspace vector RAG
- changes to provider, mailbox, calendar, history, security, or confirmation behavior
