import assert from 'node:assert/strict';

process.env.AI_ADMIN_ACCOUNTS = 'admin@example.test,account-admin-id';
process.env.AI_ALLOWED_ORIGINS = 'https://trusted.example.test';
process.env.AI_REQUESTS_PER_MINUTE = '2';
process.env.AI_REQUESTS_PER_DAY = '3';
process.env.AI_MODEL_ALLOWLIST = 'allowed-model';
process.env.AI_ENABLED_ACCOUNTS = 'enabled@example.test';
process.env.AI_WRITE_TOOL_ACCOUNTS = 'writer@example.test';

const {
	assertSameOrigin,
	consumeAccountQuota,
	isAdminAccount,
	isAccountEnabled,
	areWriteToolsEnabled,
	requireAdminAccount
} = await import('../src/security.js');
const { assertModelAllowed, getModelAllowlist } = await import('../src/config.js');
const { purgeDailyUsage } = await import('../src/history.js');
const { redactSensitiveText } = await import('../src/redaction.js');

assert.equal(isAdminAccount({ id: 'user-id', name: 'ADMIN@example.test' }), true);
assert.equal(isAdminAccount({ id: 'account-admin-id', name: 'user@example.test' }), true);
assert.equal(isAdminAccount({ id: 'user-id', name: 'user@example.test' }), false);
assert.equal(isAccountEnabled({ id: 'user-id', name: 'enabled@example.test' }), true);
assert.equal(isAccountEnabled({ id: 'user-id', name: 'disabled@example.test' }), false);
assert.equal(areWriteToolsEnabled({ id: 'user-id', name: 'writer@example.test' }), true);
assert.equal(areWriteToolsEnabled({ id: 'user-id', name: 'enabled@example.test' }), false);
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
assert.throws(() => assertModelAllowed('blocked-model'), /not allowed/);
assert.equal(
	redactSensitiveText('Authorization: Bearer abcdefghijklmnop password=hunter123'),
	'Authorization: Bearer [REDACTED] password=[REDACTED]'
);

console.log('admin_auth=ok account_policy=ok csrf=ok quota=ok model_allowlist=ok redaction=ok');
