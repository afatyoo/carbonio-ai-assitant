import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const settings = await fs.readFile('src/views/ai-settings-view.tsx', 'utf8');
assert.match(settings, /\/api\/ai\/rag\/sources/);
assert.match(settings, /\/api\/ai\/rag\/sources\/sync/);
assert.match(settings, /Manage AI Sources/);
assert.match(settings, /Enable all supported sources/);
assert.match(settings, /source\.available/);
assert.match(settings, /source\.enabled/);
assert.match(settings, /source\.unavailableReason/);

const server = await fs.readFile('gateway/src/server.js', 'utf8');
assert.match(server, /storesSessionCookies: false/);
assert.match(server, /assertAvailableRagModule/);
assert.match(server, /collectRagDocuments/);

console.log('rag_settings=ok opt_in=explicit unsupported=visible sync=server');
