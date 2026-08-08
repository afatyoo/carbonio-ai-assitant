import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const originalWorkingDirectory = process.cwd();
const testWorkingDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'carbonio-ai-security-'));
process.chdir(testWorkingDirectory);

process.env.AI_ADMIN_ACCOUNTS = 'admin@example.test,account-admin-id';
process.env.AI_ALLOWED_ORIGINS = 'https://trusted.example.test';
process.env.AI_REQUESTS_PER_MINUTE = '2';
process.env.AI_REQUESTS_PER_DAY = '3';
process.env.AI_MODEL_ALLOWLIST = 'allowed-model,locked-model';
process.env.AI_AGENT_MODEL = 'locked-model';
process.env.AI_MODEL_POLICY_JSON = JSON.stringify({
	'account:special@example.test': ['special-model'],
	'group:ai-premium@example.test': ['group-model'],
	'domain:example.test': ['domain-model'],
	'*': ['allowed-model']
});
process.env.AI_TOOL_PERMISSION_POLICY_JSON = JSON.stringify({
	'group:ai-writers@example.test': ['mail.read', 'mail.draft'],
	'domain:example.test': ['mail.read']
});
process.env.AI_ENABLED_ACCOUNTS = 'enabled@example.test';
process.env.AI_WRITE_TOOL_ACCOUNTS = 'writer@example.test,default-writer@other.test';

const {
	assertSameOrigin,
	consumeAccountQuota,
	isAdminAccount,
	isAccountEnabled,
	areWriteToolsEnabled,
	getToolPermissions,
	requireAdminAccount
} = await import('../src/security.js');
const { assertModelAllowed, getModelAllowlist, getPublicAgentConfig, updateAgentConfig } = await import(
	'../src/config.js'
);
const { closeHistoryDatabase, purgeDailyUsage } = await import('../src/history.js');
const { redactSensitiveText } = await import('../src/redaction.js');
const { sanitizeModelOutput } = await import('../src/output-safety.js');

assert.equal(isAdminAccount({ id: 'user-id', name: 'ADMIN@example.test' }), true);
assert.equal(isAdminAccount({ id: 'account-admin-id', name: 'user@example.test' }), true);
assert.equal(isAdminAccount({ id: 'user-id', name: 'user@example.test' }), false);
assert.equal(isAccountEnabled({ id: 'user-id', name: 'enabled@example.test' }), true);
assert.equal(isAccountEnabled({ id: 'user-id', name: 'disabled@example.test' }), false);
assert.equal(areWriteToolsEnabled({ id: 'user-id', name: 'writer@example.test' }), true);
assert.equal(areWriteToolsEnabled({ id: 'user-id', name: 'enabled@example.test' }), false);
assert.deepEqual(
	getToolPermissions({
		id: 'writer-id',
		name: 'writer@example.test',
		groups: ['ai-writers@example.test']
	}),
	['mail.read', 'mail.draft']
);
assert.deepEqual(
	getToolPermissions({ id: 'reader-id', name: 'reader@example.test', groups: [] }),
	['mail.read']
);
assert.deepEqual(
	getToolPermissions({ id: 'default-writer-id', name: 'default-writer@other.test', groups: [] }),
	[
		'mail.read', 'calendar.read', 'contacts.read', 'sharing.read', 'preferences.read', 'tasks.read',
		'mail.draft', 'mail.write', 'calendar.write', 'contacts.write', 'sharing.write',
		'preferences.write', 'tasks.write'
	]
);
assert.throws(
	() => requireAdminAccount({ id: 'user-id', name: 'user@example.test' }),
	/Administrator permission/
);

assert.doesNotThrow(() =>
	assertSameOrigin({
		method: 'POST',
		headers: { origin: 'https://mail.example.test', host: 'mail.example.test' }
	})
);
assert.doesNotThrow(() =>
	assertSameOrigin({
		method: 'PUT',
		headers: { origin: 'https://trusted.example.test', host: 'mail.example.test' }
	})
);
assert.throws(
	() =>
		assertSameOrigin({
			method: 'DELETE',
			headers: { origin: 'https://evil.example.test', host: 'mail.example.test' }
		}),
	/Request origin/
);
assert.throws(
	() => assertSameOrigin({ method: 'POST', headers: { 'sec-fetch-site': 'cross-site' } }),
	/Cross-site/
);

const quotaOwner = `owner-${Date.now()}`;
await consumeAccountQuota(quotaOwner);
await consumeAccountQuota(quotaOwner);
await assert.rejects(() => consumeAccountQuota(quotaOwner), /quota exceeded/);
await assert.doesNotReject(() => consumeAccountQuota(`${quotaOwner}-other`));
await purgeDailyUsage(quotaOwner);
await purgeDailyUsage(`${quotaOwner}-other`);

assert.deepEqual(getModelAllowlist(), ['allowed-model']);
assert.equal(assertModelAllowed('allowed-model'), 'allowed-model');
assert.deepEqual(
	getModelAllowlist({
		id: 'group-user',
		name: 'group-user@other.test',
		groups: ['ai-premium@example.test']
	}),
	['group-model']
);
assert.deepEqual(getModelAllowlist({ name: 'reader@example.test', groups: [] }), ['domain-model']);
assert.equal(
	assertModelAllowed('special-model', {
		name: 'special@example.test',
		groups: ['ai-premium@example.test']
	}),
	'special-model'
);
assert.throws(() => assertModelAllowed('blocked-model'), /not allowed/);
const lockedConfig = getPublicAgentConfig();
assert.equal(lockedConfig.effectiveModel, 'locked-model');
assert.equal(lockedConfig.configSource.model, 'environment');
assert.deepEqual(lockedConfig.lockedFields, ['model']);
assert.throws(
	() => updateAgentConfig({ provider: 'openrouter', model: 'allowed-model' }),
	/model is managed by environment/
);
delete process.env.AI_AGENT_MODEL;
const publicConfig = updateAgentConfig({
	provider: 'openrouter',
	model: 'allowed-model',
	apiKey: 'must-not-be-persisted'
});
assert.equal(publicConfig.hasApiKey, true);
assert.equal(publicConfig.effectiveModel, 'allowed-model');
assert.equal(publicConfig.configSource.model, 'runtime');
assert.notEqual(publicConfig.configRevision, lockedConfig.configRevision);
const savedConfig = JSON.parse(
	fs.readFileSync(path.join(testWorkingDirectory, '.runtime', 'config.json'), 'utf8')
);
assert.equal(Object.hasOwn(savedConfig, 'apiKey'), false);
assert.equal(
	redactSensitiveText('Authorization: Bearer abcdefghijklmnop password=hunter123'),
	'Authorization: Bearer [REDACTED] password=[REDACTED]'
);
assert.equal(sanitizeModelOutput('<script>alert(1)</script>\u0000'), '<script>alert(1)</script>');
const assistantViewPath = new URL('../../src/views/ai-assistant-view.tsx', import.meta.url);
if (fs.existsSync(assistantViewPath)) {
	const assistantView = fs.readFileSync(assistantViewPath, 'utf8');
	assert.equal(assistantView.includes('dangerouslySetInnerHTML'), false);
	assert.match(assistantView, /normalizeAssistantDisplayText\(message\.text, locale\)/);
}

console.log('admin_auth=ok account_policy=ok group_policy=ok tool_policy=ok csrf=ok quota=ok model_allowlist=ok credential_persistence=ok redaction=ok safe_rendering=ok');
await closeHistoryDatabase();
process.chdir(originalWorkingDirectory);
fs.rmSync(testWorkingDirectory, { recursive: true, force: true });
