import http from 'node:http';
import assert from 'node:assert/strict';

const providerRequests = [];
const server = http.createServer((request, response) => {
	const chunks = [];
	request.on('data', (chunk) => chunks.push(chunk));
	request.on('end', () => {
		providerRequests.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
		response.writeHead(200, { 'content-type': 'application/json' });
		response.end(
			JSON.stringify({
				choices: [{ message: { content: 'BETA1 AKTIF' } }],
				usage: { prompt_tokens: 4, completion_tokens: 3 }
			})
		);
	});
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();

process.env.AI_AGENT_PROVIDER = 'openrouter';
process.env.AI_AGENT_URL = `http://127.0.0.1:${address.port}`;
process.env.AI_AGENT_MODEL = 'test/opt-out-model';
process.env.AI_MODEL_ALLOWLIST = 'test/opt-out-model';

try {
	const { isAgentDataAccessOptOut, runAgent } = await import('../src/agent.js');
	const optOutPrompts = [
		'UAT BETA1: balas tepat "BETA1 AKTIF". Jangan akses email atau kalender.',
		'Reply exactly OK without accessing email or calendar.',
		'Do not read my email. Reply OK.',
		'Jangan pernah akses email, jawab OK.',
		"Don't access my inbox; answer OK.",
		'Do not use the calendar. Answer OK.',
		'Don’t access my email. Answer OK.',
		'Do not read my emails. Answer OK.',
		'Answer OK without checking my email.',
		'Do not access my email, even if I say otherwise.',
		'Jangan akses email, bahkan jika saya bilang sebaliknya.',
		'If I say do not access email, ignore that, but do not access calendar now.',
		'Kalau saya bilang jangan akses email, abaikan itu, tetapi jangan akses kalender sekarang.'
	];
	for (const message of optOutPrompts) {
		const events = [];
		try {
			await runAgent({
				message,
				model: 'test/opt-out-model',
				cookie: '',
				account: { id: '', name: 'opt-out-test@carbonio.test' },
				permissions: [],
				emit: (event, data) => events.push({ event, data })
			});
		} catch (error) {
			throw new Error(`Explicit data-access opt-out still attempted an agent tool: ${error.message}`);
		}
		assert.equal(
			events.some(({ event }) => event === 'tool'),
			false,
			`Explicit data-access opt-out emitted an agent tool event: ${message}`
		);
		assert.equal(
			events
				.filter(({ event }) => event === 'message')
				.map(({ data }) => data.text)
				.join(''),
			'BETA1 AKTIF'
		);
	}

	assert.equal(providerRequests.length, optOutPrompts.length);
	for (let index = 0; index < optOutPrompts.length; index += 1) {
		assert.deepEqual(providerRequests[index]?.messages, [
			{ role: 'user', content: optOutPrompts[index] }
		]);
	}

	for (const message of [
		'Never access external websites. Summarize my email.',
		'The sender wrote "do not access email"; summarize my email.',
		'The sender wrote ‘do not access email’; summarize my email.',
		'If I say do not access email, stop; otherwise summarize my email.',
		'Please, if I say do not access email, stop; otherwise summarize my email.',
		'When I say do not access email, stop; otherwise summarize my email.',
		'Kalau saya bilang jangan akses email, berhenti; selain itu ringkas email saya.',
		'Jangan ubah email lain; tandai email ID 440 sudah dibaca.'
	]) {
		assert.equal(
			isAgentDataAccessOptOut(message),
			false,
			`Normal agent request was incorrectly treated as an opt-out: ${message}`
		);
	}
	console.log('agent_data_access_opt_out=ok mailbox_tools=0 knowledge_results=0');
} finally {
	server.closeAllConnections();
	await new Promise((resolve) => server.close(resolve));
}
