# Official Carbonio i18n v1.0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Carbonio AI Assistant v1.0.1 with complete static UI catalogs for all nine officially included Carbonio Web GUI locales.

**Architecture:** Keep `i18n/en.json` as the canonical catalog and load locale-specific static JSON through Carbonio Shell's existing component i18n backend. Add one manifest-driven Node contract that validates locale membership, key parity, source-key coverage, interpolation tokens, non-empty values, and build output before versioning and publishing the release.

**Tech Stack:** React/TypeScript, Carbonio Shell UI i18next integration, JSON locale catalogs, Node.js 22 contract tests, Carbonio SDK build, GitHub Actions, systemd deployment.

## Global Constraints

- Supported locale codes are exactly `en`, `fr`, `hi`, `id`, `it`, `pt`, `ru`, `es`, and `th`.
- `pt` means Brazilian Portuguese because that is Carbonio's official Web GUI code.
- Community locales fall back to English and are outside v1.0.1.
- Every catalog contains the same non-empty string leaves and exact interpolation-token multisets as English.
- Provider answers, mailbox content, and external server/provider messages are not automatically translated.
- Translations are high-quality first passes and must not be described as native-reviewed.
- No runtime translation API or new dependency is introduced.
- Existing provider, mailbox, calendar, history, security, RAG, and confirmation behavior remains unchanged.
- Root package, gateway package, and gateway lock versions move together to `1.0.1`.
- Existing v1.0.0 risk acceptance remains visible and is not converted into passing evidence.

---

### Task 1: Add the manifest-driven i18n contract

**Files:**
- Create: `i18n/locales.json`
- Create: `scripts/self-test-i18n.mjs`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/release.yml`
- Modify: `scripts/self-test-ui-contract.mjs`

**Interfaces:**
- Consumes: locale JSON under `i18n/`, TypeScript sources under `src/`, and built files under `dist/i18n/` when `--dist` is supplied.
- Produces: CLI `node scripts/self-test-i18n.mjs [--dist]` and package script `self-test:i18n`.

- [ ] **Step 1: Write the supported-locale manifest**

Create this exact JSON:

```json
{
	"fallback": "en",
	"official": ["en", "fr", "hi", "id", "it", "pt", "ru", "es", "th"]
}
```

- [ ] **Step 2: Write the failing catalog contract**

Implement `scripts/self-test-i18n.mjs` with pure Node APIs. It must:

```js
const manifest = JSON.parse(await readFile('i18n/locales.json', 'utf8'));
assert.deepEqual(manifest.official, ['en', 'fr', 'hi', 'id', 'it', 'pt', 'ru', 'es', 'th']);
assert.equal(manifest.fallback, 'en');
```

Flatten nested JSON leaves, reject non-string or empty values, compare sorted key arrays with
English, and compare a sorted token array extracted with `/\{\{[A-Za-z0-9_]+\}\}/g` for each
matching key. Recursively scan `src/**/*.ts` and `src/**/*.tsx`; collect literal keys passed
to `t(...)` plus namespaced values assigned as `key: '...'`, then report every source key
missing from English. When invoked with `--dist`, compare every `dist/i18n/<code>.json` with
its source JSON and require all nine files.

Print one deterministic success line:

```text
i18n_locales=9 key_parity=ok interpolation=ok source_coverage=ok dist=skipped
```

or `dist=ok` when verifying build output.

- [ ] **Step 3: Prove the new contract fails**

Run: `node scripts/self-test-i18n.mjs`

Expected: FAIL listing missing locale file `i18n/fr.json` before any implementation exists.

- [ ] **Step 4: Wire the contract into local and GitHub gates**

Add package script:

```json
"self-test:i18n": "node scripts/self-test-i18n.mjs"
```

Remove the two-locale parity implementation from `self-test-ui-contract.mjs` and retain a
contract assertion that `package.json` exposes `self-test:i18n`. Add `pnpm run self-test:i18n`
before UI contracts in CI and release workflows, and run
`node scripts/self-test-i18n.mjs --dist` immediately after their UI build/package step.

- [ ] **Step 5: Commit the failing contract**

```bash
git add i18n/locales.json scripts/self-test-i18n.mjs package.json scripts/self-test-ui-contract.mjs .github/workflows/ci.yml .github/workflows/release.yml
git commit -m "test: enforce official Carbonio locale coverage"
```

### Task 2: Complete the canonical English and Indonesian catalogs

**Files:**
- Modify: `i18n/en.json`
- Modify: `i18n/id.json`
- Reference: `src/views/ai-assistant-view.tsx`
- Reference: `src/views/ai-settings-view.tsx`
- Reference: `src/views/assistant-sidebar.tsx`
- Reference: `src/utils/action-confirmation.ts`

**Interfaces:**
- Consumes: every statically discoverable translation key reported by Task 1.
- Produces: complete, key-identical English and Indonesian canonical catalogs.

- [ ] **Step 1: Run the source-coverage portion and capture missing keys**

Run: `node scripts/self-test-i18n.mjs`

Use the deterministic missing-key output as the exact checklist. Expected gaps include
Settings administration status, metrics, audit, provider health, and related loading/error
copy currently supplied only by inline fallbacks.

- [ ] **Step 2: Add every missing English key using its current inline fallback**

Preserve existing namespace and key names. Do not rewrite established English copy except to
correct an objectively incomplete fallback. Every source key must resolve in `en.json`.

- [ ] **Step 3: Add matching Indonesian translations**

Translate each newly canonicalized key into Indonesian with exact placeholders. Preserve
provider names, model IDs, API, HTTP, request IDs, and Carbonio product terminology.

- [ ] **Step 4: Run a two-catalog diagnostic**

Temporarily run the contract against `en` and `id` only by passing an optional documented
`--locales en,id` diagnostic argument. Expected: key parity, interpolation, and source coverage
pass before the seven new files exist. The default manifest run must still fail.

- [ ] **Step 5: Commit canonical completion**

```bash
git add i18n/en.json i18n/id.json scripts/self-test-i18n.mjs
git commit -m "fix: complete canonical assistant translations"
```

### Task 3: Add French, Italian, Portuguese, and Spanish catalogs

**Files:**
- Create: `i18n/fr.json`
- Create: `i18n/it.json`
- Create: `i18n/pt.json`
- Create: `i18n/es.json`

**Interfaces:**
- Consumes: final canonical English key tree from Task 2.
- Produces: four Latin-script locale catalogs with exact key and interpolation parity.

- [ ] **Step 1: Translate the complete catalog into French**

Use standard modern UI terminology. Examples that establish tone and terminology:

```json
{
	"app.name": "Assistant IA",
	"sidebar.new_chat": "Nouvelle conversation",
	"chat.send": "Envoyer le message",
	"chat.confirm_send_title": "Confirmer l’envoi de cet e-mail",
	"settings.api_key": "Clé API"
}
```

The actual file remains nested and contains every canonical key.

- [ ] **Step 2: Translate the complete catalog into Italian**

Use `Assistente IA`, `Nuova chat`, `Invia messaggio`, `Conferma l’invio di questa email`, and
`Chiave API` as the corresponding terminology anchors.

- [ ] **Step 3: Translate the complete catalog into Brazilian Portuguese under `pt`**

Use `Assistente de IA`, `Nova conversa`, `Enviar mensagem`,
`Confirmar o envio deste e-mail`, and `Chave da API` as terminology anchors.

- [ ] **Step 4: Translate the complete catalog into Spanish**

Use `Asistente de IA`, `Nueva conversación`, `Enviar mensaje`,
`Confirmar el envío de este correo`, and `Clave de API` as terminology anchors.

- [ ] **Step 5: Run the targeted locale contract**

Run: `node scripts/self-test-i18n.mjs --locales en,fr,id,it,pt,es`

Expected: locale count 6 with key, interpolation, source-coverage, and non-empty checks green.

- [ ] **Step 6: Commit the four catalogs**

```bash
git add i18n/fr.json i18n/it.json i18n/pt.json i18n/es.json
git commit -m "feat: add official Latin-script locales"
```

### Task 4: Add Hindi, Russian, and Thai catalogs

**Files:**
- Create: `i18n/hi.json`
- Create: `i18n/ru.json`
- Create: `i18n/th.json`

**Interfaces:**
- Consumes: final canonical English key tree from Task 2.
- Produces: Devanagari, Cyrillic, and Thai locale catalogs with exact key and interpolation parity.

- [ ] **Step 1: Translate the complete catalog into Hindi**

Use `AI सहायक`, `नई चैट`, `संदेश भेजें`, `इस ईमेल को भेजने की पुष्टि करें`, and `API कुंजी`
as terminology anchors. Preserve Latin technical identifiers and all placeholders.

- [ ] **Step 2: Translate the complete catalog into Russian**

Use `ИИ-ассистент`, `Новый чат`, `Отправить сообщение`,
`Подтвердите отправку этого письма`, and `Ключ API` as terminology anchors.

- [ ] **Step 3: Translate the complete catalog into Thai**

Use `ผู้ช่วย AI`, `แชทใหม่`, `ส่งข้อความ`, `ยืนยันการส่งอีเมลนี้`, and `คีย์ API` as terminology
anchors. Do not insert spaces inside Thai phrases merely to mirror English word boundaries.

- [ ] **Step 4: Run the default nine-locale contract**

Run: `node scripts/self-test-i18n.mjs`

Expected: `i18n_locales=9 key_parity=ok interpolation=ok source_coverage=ok dist=skipped`.

- [ ] **Step 5: Commit the three catalogs**

```bash
git add i18n/hi.json i18n/ru.json i18n/th.json
git commit -m "feat: add official Indic Cyrillic and Thai locales"
```

### Task 5: Verify runtime fallback and production build packaging

**Files:**
- Modify: `src/i18n/use-app-translation.ts`
- Modify: `scripts/self-test-ui-contract.mjs`
- Verify: `dist/i18n/*.json`

**Interfaces:**
- Consumes: official locale manifest and nine complete catalogs.
- Produces: deterministic English fallback for unsupported locale variants and build evidence for all catalogs.

- [ ] **Step 1: Add failing fallback and locale-normalization contracts**

The UI contract must require explicit normalization behavior:

```text
en-US -> en
pt-BR -> pt
id-ID -> id
de-DE -> en
empty/unknown -> en
```

It must also require that the date/time locale exposed by `useAppTranslation` is the normalized
supported code rather than an unsupported raw value.

- [ ] **Step 2: Implement a pure locale resolver**

Create and export in `use-app-translation.ts`:

```ts
export const resolveAppLocale = (locale?: string): string
```

Normalize `_` to `-`, compare case-insensitively, map exact official base codes and regional
variants to their base, and return `en` for every unsupported value. Use the result returned by
the hook for `Intl` and `toLocaleString`; Carbonio Shell remains responsible for loading the
component catalog.

- [ ] **Step 3: Build and verify packaged catalogs**

Run:

```bash
pnpm run build
node scripts/self-test-i18n.mjs --dist
```

Expected: nine source catalogs are copied unchanged to `dist/i18n/`; `locales.json` may also be
present but is not counted as a locale.

- [ ] **Step 4: Commit fallback and build coverage**

```bash
git add src/i18n/use-app-translation.ts scripts/self-test-ui-contract.mjs
git commit -m "fix: normalize official Carbonio locales"
```

### Task 6: Prepare the v1.0.1 release record

**Files:**
- Modify: `package.json`
- Modify: `gateway/package.json`
- Modify: `gateway/package-lock.json`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Create: `docs/releases/v1.0.1.md`
- Modify: `scripts/build-release-notes.mjs`
- Modify: `scripts/self-test-release-report.mjs`

**Interfaces:**
- Consumes: verified nine-locale implementation and existing v1.0.0 evidence.
- Produces: exact v1.0.1 version metadata, public documentation, and release contract.

- [ ] **Step 1: Add failing v1.0.1 release assertions**

Update release tests to require version `1.0.1`, report `docs/releases/v1.0.1.md`, all nine
locale codes, the linguistic-review disclosure, `pnpm run self-test:i18n` in CI and release,
and post-build `--dist` verification. Keep the minimum closed-bug count at 25 and preserve the
v1.0.0 bug ledger through the new report.

- [ ] **Step 2: Align all package versions**

Set root `package.json`, gateway `package.json`, gateway lock root, and gateway lock package
version to exactly `1.0.1`. Do not modify dependency versions.

- [ ] **Step 3: Write the public documentation**

Add a v1.0.1 CHANGELOG section and README language section listing all nine codes. State that
the seven new catalogs are high-quality first passes without native linguistic sign-off, AI
answers/external content are not automatically translated, and community locales fall back to
English.

- [ ] **Step 4: Write the stable release report**

Create `docs/releases/v1.0.1.md` with the established mandatory headings. It must describe
locale architecture, 100 percent key/interpolation/source parity, build evidence, fallback,
verification, deployment steps, inherited risk acceptance, and the linguistic-review limitation.
Reuse the complete 25-item closed-bug ledger without changing historical claims.

- [ ] **Step 5: Run the release contract and commit**

```bash
pnpm run self-test:release
git add package.json gateway/package.json gateway/package-lock.json README.md CHANGELOG.md docs/releases/v1.0.1.md scripts/build-release-notes.mjs scripts/self-test-release-report.mjs
git commit -m "release: prepare v1.0.1 localization"
```

### Task 7: Full verification, review, publication, and pilot deployment

**Files:**
- Verify: entire repository
- Publish: tag `v1.0.1`
- Deploy: Carbonio pilot through the public v1.0.1 artifact

**Interfaces:**
- Consumes: exact clean v1.0.1 commit and existing deployment scripts.
- Produces: green exact-head CI, public stable release, checksum-verified pilot deployment, and nine-locale evidence.

- [ ] **Step 1: Run complete local verification**

Run type-check, lint, i18n contract, UI contracts, deployment smoke, release contract, SDK
build, post-build i18n contract, gateway syntax/self-tests, audits, and `git diff --check` with
Node 22. All must exit zero.

- [ ] **Step 2: Review translation safety and diff scope**

Verify no locale is a copy of English except product names/technical tokens, no destructive
warning is empty or weakened, all placeholders match, no secrets appear, and no dependency or
runtime behavior changed outside the locale resolver.

- [ ] **Step 3: Push the exact commit to main and wait for CI**

Fetch `origin`, require a fast-forward, push without force, and wait for the exact-head CI run.
Every i18n, UI, deployment, gateway, PostgreSQL, build, audit, and secret gate must pass.

- [ ] **Step 4: Tag and publish v1.0.1**

Create an annotated `v1.0.1` tag on the exact approved main commit, push it, wait for the tag
workflow, and verify the public archive/checksum metadata plus stable release body.

- [ ] **Step 5: Back up and deploy the public artifact**

Create a fresh custom-format PostgreSQL backup, validate with `pg_restore --list`, download the
public archive and checksum on the Carbonio host, verify them, run `install.sh`, strict smoke,
installed gateway regressions, and PostgreSQL disconnect/reconnect without gateway restart.

- [ ] **Step 6: Run authenticated locale UAT**

Verify the exact v1.0.1 UI asset and load each of `en`, `fr`, `hi`, `id`, `it`, `pt`, `ru`,
`es`, and `th`. For each locale check navigation label, sidebar, empty state, composer, process
status, one safe confirmation preview that is cancelled, and Settings. Confirm an unsupported
community locale falls back to English. Do not execute mailbox or calendar mutations.

- [ ] **Step 7: Record evidence and clean staging**

Record exact commit, workflows, artifact SHA-256, backup path/hash/mode, service health,
PostgreSQL PID continuity, and locale UAT evidence in the release report or follow-up UAT
record. Remove only the exact temporary server staging directory after verification.
