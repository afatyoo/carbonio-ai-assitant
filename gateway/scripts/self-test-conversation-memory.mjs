import http from 'node:http';
import assert from 'node:assert/strict';

const providerRequests = [];
const server = http.createServer((request, response) => {
	const chunks = [];
	request.on('data', (chunk) => chunks.push(chunk));
	request.on('end', () => {
		providerRequests.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
		response.writeHead(200, { 'content-type': 'application/json' });
		response.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 4, completion_tokens: 1 } }));
	});
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

process.env.AI_AGENT_PROVIDER = 'openrouter';
process.env.AI_AGENT_URL = `http://127.0.0.1:${server.address().port}`;
process.env.AI_AGENT_MODEL = 'test/memory-model';
process.env.AI_MODEL_ALLOWLIST = 'test/memory-model';
process.env.AI_HISTORY_CONTEXT_MESSAGES = '4';

try {
	const { selectRecentTurns, trimToPriorTurns, formatConversationMemory } = await import('../src/conversation-memory.js');
	const { runAgent } = await import('../src/agent.js');

	// current prompt + empty placeholder saved by the browser are removed
	const saved = [
		{ role: 'user', text: 'u1' }, { role: 'assistant', text: 'a1' },
		{ role: 'user', text: 'u2' }, { role: 'assistant', text: 'a2' },
		{ role: 'user', text: 'now' }, { role: 'assistant', text: '' }
	];
	assert.deepEqual(trimToPriorTurns(saved, 'now').map((m) => m.text), ['u1', 'a1', 'u2', 'a2']);
	// regenerate: previous answer to the same prompt is removed too
	saved[5].text = 'old answer';
	assert.deepEqual(trimToPriorTurns(saved, 'now').map((m) => m.text), ['u1', 'a1', 'u2', 'a2']);

	// window of 4 messages, redaction, truncation, never starts with an assistant turn
	const turns = selectRecentTurns(
		[...saved.slice(0, 4), { role: 'user', text: 'password: hunter2hunter2' }, { role: 'assistant', text: 'x'.repeat(5000) }, { role: 'user', text: 'now' }],
		'now'
	);
	assert.equal(turns[0].role, 'user');
	assert.ok(turns.length <= 4);
	assert.ok(!JSON.stringify(turns).includes('hunter2hunter2'));
	assert.ok(turns.every((t) => t.text.length <= 1_520));
	assert.equal(formatConversationMemory([]), '');

	// end to end: history reaches the provider on a normal answer
	await runAgent({
		message: 'jelaskan lebih singkat',
		model: '',
		history: [{ role: 'user', text: 'apa itu carbonio?' }, { role: 'assistant', text: 'Carbonio adalah platform email.' }],
		cookie: '',
		account: { id: 'memory-test', role: 'user' },
		permissions: [],
		emit: () => {}
	});
	const sent = JSON.stringify(providerRequests.at(-1));
	assert.ok(sent.includes('<conversation_history'), 'history block missing');
	assert.ok(sent.includes('Carbonio adalah platform email.'));
	assert.ok(sent.includes('jelaskan lebih singkat'));

	// opt-out requests never carry history
	providerRequests.length = 0;
	await runAgent({
		message: 'Do not access my email. Reply OK.',
		model: '',
		history: [{ role: 'user', text: 'SECRET-EARLIER-TURN' }],
		cookie: '',
		account: { id: 'memory-test', role: 'user' },
		permissions: [],
		emit: () => {}
	});
	assert.ok(!JSON.stringify(providerRequests).includes('SECRET-EARLIER-TURN'));
	// ---- rolling summary (fase 2) ----
	const { buildConversationContext, summaryAnchor } = await import('../src/conversation-memory.js');
	const convo = (count) =>
		Array.from({ length: count }, (_, i) => ({ role: i % 2 === 0 ? 'user' : 'assistant', text: `m${i}` }));
	let store = null;
	let summarizeCalls = 0;
	const deps = {
		getSummary: async () => store,
		saveSummary: async (value) => { store = value; },
		summarize: async ({ previousSummary, messages }) => {
			summarizeCalls += 1;
			return `S${summarizeCalls}(${previousSummary || 'none'}):${messages.length}`;
		}
	};
	process.env.AI_HISTORY_CONTEXT_MESSAGES = '4';
	process.env.AI_HISTORY_SUMMARY_BATCH = '4';

	// short conversation: no summary, no provider call
	let ctx = await buildConversationContext({ ...deps, messages: convo(4), currentMessage: 'now' });
	assert.equal(summarizeCalls, 0);
	assert.ok(ctx.every((t) => t.role !== 'summary'));

	// first overflow: 8 prior messages, 4 older get summarized and stored
	ctx = await buildConversationContext({ ...deps, messages: convo(8), currentMessage: 'now' });
	assert.equal(summarizeCalls, 1);
	assert.equal(store.coveredCount, 4);
	assert.equal(ctx[0].role, 'summary');
	assert.deepEqual(ctx.slice(1).map((t) => t.text), ['m4', 'm5', 'm6', 'm7']);

	// next turn, gap below batch: summary reused, uncovered messages stay verbatim, no new call
	ctx = await buildConversationContext({ ...deps, messages: convo(10), currentMessage: 'now' });
	assert.equal(summarizeCalls, 1);
	assert.equal(ctx[0].role, 'summary');
	assert.deepEqual(ctx.slice(1).map((t) => t.text), ['m4', 'm5', 'm6', 'm7', 'm8', 'm9']);

	// gap reaches the batch: summary is refreshed incrementally from the old summary
	ctx = await buildConversationContext({ ...deps, messages: convo(12), currentMessage: 'now' });
	assert.equal(summarizeCalls, 2);
	assert.equal(store.coveredCount, 8);
	assert.ok(ctx[0].text.startsWith('S2(S1('));

	// messages covered by the summary were edited: stale summary is discarded and rebuilt
	const edited = convo(12);
	edited[1].text = 'edited';
	await buildConversationContext({ ...deps, messages: edited, currentMessage: 'now' });
	assert.equal(summarizeCalls, 3);
	assert.ok(store.anchor === summaryAnchor(edited.slice(0, 8)));

	// summarizer failure degrades to the plain window
	const errors = [];
	ctx = await buildConversationContext({
		...deps,
		getSummary: async () => null,
		summarize: async () => { throw new Error('provider down'); },
		onError: (e) => errors.push(e.message),
		messages: convo(12),
		currentMessage: 'now'
	});
	assert.equal(errors.length, 1);
	assert.ok(ctx.every((t) => t.role !== 'summary') && ctx.length <= 4);

	// the summary is rendered inside the untrusted block and redacted
	const block = formatConversationMemory([{ role: 'summary', text: 'api_key: abcdef123456789' }, { role: 'user', text: 'hi' }]);
	assert.ok(block.includes('Summary of earlier turns') && block.includes('<conversation_history'));
	console.log('conversation memory self-test passed');
} finally {
	server.close();
}
