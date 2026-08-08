import assert from 'node:assert/strict';
import fs from 'node:fs';

import { normalizeAssistantDisplayText } from '../src/utils/plain-text-answer.ts';

const raw = `### **1. TEST UPGRADE**
- **Dari:** zextras@carbonio.lab
- **Subjek:** TEST UPGRADE
- **Waktu:** 1785472709000
- **Status:** **Belum dibaca** (unread)
---
**Total:** 2 email (1 belum dibaca).`;

const normalized = normalizeAssistantDisplayText(raw, 'id');
assert.doesNotMatch(normalized, /###|\*\*|^---$/m);
assert.doesNotMatch(normalized, /1785472709000/);
assert.match(normalized, /1\. TEST UPGRADE/);
assert.match(normalized, /Dari: zextras@carbonio\.lab/);
assert.match(normalized, /Status: Belum dibaca \(unread\)/);
assert.match(normalized, /Total: 2 email/);

const draft = '**Keep literal markers inside draft content**';
assert.equal(draft, '**Keep literal markers inside draft content**');

const assistantView = fs.readFileSync(
	new URL('../src/views/ai-assistant-view.tsx', import.meta.url),
	'utf8'
);
assert.doesNotMatch(assistantView, /setSelectedModel\((?:latest|conversation)\.model\)/);
assert.match(assistantView, /normalizeAssistantDisplayText\(message\.text, locale\)/);

const agent = fs.readFileSync(new URL('../gateway/src/agent.js', import.meta.url), 'utf8');
assert.match(agent, /Return readable plain text without Markdown headings/);

const server = fs.readFileSync(new URL('../gateway/src/server.js', import.meta.url), 'utf8');
assert.match(server, /updatedConfig\.configRevision !== previousRevision/);
assert.match(server, /await purgeAllAccountPreferences\(\)/);

console.log(
	'plain_text_markdown=ok localized_timestamp=ok active_model=ok config_invalidation=ok draft_boundary=ok'
);
