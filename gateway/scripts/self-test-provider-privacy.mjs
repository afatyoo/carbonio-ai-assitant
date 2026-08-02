import http from 'node:http';
import assert from 'node:assert/strict';

let providerRequest = null;
const server = http.createServer((request, response) => {
	const chunks = [];
	request.on('data', (chunk) => chunks.push(chunk));
	request.on('end', () => {
		providerRequest = JSON.parse(Buffer.concat(chunks).toString('utf8'));
		response.writeHead(200, { 'content-type': 'application/json' });
		response.end(
			JSON.stringify({
				choices: [{ message: { content: 'Privacy routing active.' } }],
				usage: { prompt_tokens: 4, completion_tokens: 3 }
			})
		);
	});
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();

process.env.NODE_ENV = 'production';
process.env.AI_AGENT_PROVIDER = 'openrouter';
process.env.AI_AGENT_URL = `http://127.0.0.1:${address.port}`;
process.env.AI_AGENT_MODEL = 'test/privacy-model';
process.env.AI_MODEL_ALLOWLIST = 'test/privacy-model';
process.env.AI_OPENROUTER_DENY_DATA_COLLECTION = 'false';
process.env.AI_OPENROUTER_ZDR = 'false';

try {
	const { runAgent } = await import('../src/agent.js');
	await runAgent({
		message: 'Hello',
		model: 'test/privacy-model',
		cookie: '',
		account: { id: '', name: 'privacy-test@carbonio.test' },
		permissions: [],
		emit: () => {}
	});

	assert.deepEqual(providerRequest?.provider, {
		data_collection: 'deny',
		zdr: true
	});
	console.log('openrouter_production_privacy_lock=ok');
} finally {
	server.closeAllConnections();
	await new Promise((resolve) => server.close(resolve));
}
