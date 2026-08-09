import assert from 'node:assert/strict';

process.env.NODE_ENV = 'production';
process.env.AI_AGENT_PROVIDER = 'openrouter';
process.env.AI_AGENT_URL = 'https://provider.invalid/v1';
process.env.AI_AGENT_API_KEY = 'test-key';
process.env.AI_AGENT_MODEL = 'test/primary';
process.env.AI_MODEL_FALLBACKS = 'test/fallback';
process.env.AI_MODEL_ALLOWLIST = 'test/primary,test/fallback';
process.env.AI_PROVIDER_RETRIES = '0';

const requests = [];
globalThis.fetch = async (_url, options) => {
	const body = JSON.parse(options.body);
	requests.push(body);
	if (body.model === 'test/primary') {
		return new Response(JSON.stringify({ error: { message: 'model endpoint unavailable' } }), {
			status: 404,
			headers: { 'content-type': 'application/json' }
		});
	}
	return new Response(JSON.stringify({
		choices: [{ message: { content: 'CARBONIO_AI_OK' } }],
		usage: { prompt_tokens: 1, completion_tokens: 1 }
	}), { status: 200, headers: { 'content-type': 'application/json' } });
};

const { testProviderConnection } = await import('../src/agent.js');
const result = await testProviderConnection({
	model: 'test/primary',
	account: { id: 'fallback-test', name: 'fallback@example.test', groups: [] }
});
assert.equal(result.activeModel, 'test/fallback');
assert.equal(result.usedFallback, true);
assert.deepEqual(requests.map(({ model }) => model), ['test/primary', 'test/fallback']);
assert.equal(requests[0].provider.zdr, true);
assert.equal(requests[0].provider.data_collection, 'deny');

console.log('provider_fallback=ok active_model=visible privacy_lock=ok');
