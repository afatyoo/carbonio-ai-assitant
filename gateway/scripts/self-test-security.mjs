import assert from 'node:assert/strict';

process.env.AI_ADMIN_ACCOUNTS = 'admin@example.test,account-admin-id';
process.env.AI_ALLOWED_ORIGINS = 'https://trusted.example.test';
process.env.AI_REQUESTS_PER_MINUTE = '2';
process.env.AI_REQUESTS_PER_DAY = '3';
process.env.AI_MODEL_ALLOWLIST = 'allowed-model';

const {
	assertSameOrigin,
	consumeAccountQuota,
	isAdminAccount,
	requireAdminAccount
} = await import('../src/security.js');
const { assertModelAllowed, getModelAllowlist } = await import('../src/config.js');
const { purgeDailyUsage } = await import('../src/history.js');

assert.equal(isAdminAccount({ id: 'user-id', name: 'ADMIN@example.test' }), true);
assert.equal(isAdminAccount({ id: 'account-admin-id', name: 'user@example.test' }), true);
assert.equal(isAdminAccount({ id: 'user-id', name: 'user@example.test' }), false);
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

console.log('admin_auth=ok csrf=ok quota=ok model_allowlist=ok');
