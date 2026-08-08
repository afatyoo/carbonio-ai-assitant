import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import https from 'node:https';

import { normalizeContextReference } from '../src/context-reference.js';

assert.deepEqual(
	normalizeContextReference({
		module: 'mail',
		objectType: 'message',
		objectId: '440',
		action: 'summarize',
		body: 'untrusted browser body must be discarded',
		selection: ['440']
	}),
	{
		module: 'mail',
		objectType: 'message',
		objectId: '440',
		action: 'summarize',
		revision: undefined,
		folderId: undefined,
		selection: ['440']
	}
);
assert.equal(normalizeContextReference(undefined), null);
assert.throws(
	() => normalizeContextReference({ module: 'mail', objectType: 'message', objectId: '../../1', action: 'summarize' }),
	/Invalid context objectId/
);
assert.throws(
	() => normalizeContextReference({ module: 'admin', objectType: 'message', objectId: '1', action: 'summarize' }),
	/Unsupported context module/
);
assert.throws(
	() => normalizeContextReference({ module: 'mail', objectType: 'message', objectId: '1', action: 'delete' }),
	/Unsupported context action/
);

process.env.AI_AGENT_PROVIDER = 'openrouter';
process.env.AI_AGENT_URL = 'https://provider.example.test/v1';
process.env.AI_AGENT_MODEL = 'test/context-model';
process.env.AI_MODEL_ALLOWLIST = 'test/context-model';
const originalRequest = https.request;
const originalFetch = globalThis.fetch;
const soapRequests = [];
const providerRequests = [];

https.request = (options, callback) => {
	const request = new EventEmitter();
	request.setTimeout = () => request;
	request.destroy = (error) => {
		if (error) request.emit('error', error);
	};
	request.end = (payload) => {
		const operation = String(options.path).match(/\/([^/]+)Request$/)?.[1];
		const input = JSON.parse(String(payload)).Body?.[`${operation}Request`] ?? {};
		soapRequests.push({ operation, input });
		const response = new EventEmitter();
		response.statusCode = 200;
		queueMicrotask(() => {
			callback(response);
			response.emit(
				'data',
				Buffer.from(
					JSON.stringify({
						Body: {
							GetMsgResponse: {
								m: [
									{
										id: '440',
										su: 'Exact selected message',
										e: [{ t: 'f', a: 'sender@example.test' }],
										mp: [{ ct: 'text/plain', body: true, content: 'PRIVATE EXACT BODY' }]
									}
								]
							}
						}
					})
				)
			);
			response.emit('end');
		});
	};
	return request;
};

globalThis.fetch = async (_url, init) => {
	providerRequests.push(JSON.parse(init.body));
	return {
		ok: true,
		status: 200,
		json: async () => ({
			choices: [{ message: { content: 'Exact context answer' } }],
			usage: { prompt_tokens: 4, completion_tokens: 3 }
		})
	};
};

try {
	const { runAgent } = await import('../src/agent.js');
	const events = [];
	await runAgent({
		message: 'Summarize the selected email.',
		model: 'test/context-model',
		contextReference: normalizeContextReference({
			module: 'mail',
			objectType: 'message',
			objectId: '440',
			action: 'summarize'
		}),
		cookie: 'ZM_AUTH_TOKEN=test',
		account: { id: 'owner', name: 'owner@example.test' },
		permissions: ['mail.read'],
		emit: (event, data) => events.push({ event, data })
	});
	assert.deepEqual(soapRequests.map(({ operation }) => operation), ['GetMsg']);
	assert.equal(soapRequests[0].input.m.id, '440');
	assert.match(providerRequests[0].messages.at(-1).content, /PRIVATE EXACT BODY/);
	assert.match(providerRequests[0].messages.at(-1).content, /Do not search for or substitute another item/);
	assert.equal(
		events.filter(({ event }) => event === 'message').map(({ data }) => data.text).join(''),
		'Exact context answer'
	);
} finally {
	https.request = originalRequest;
	globalThis.fetch = originalFetch;
}

console.log(
	'context_schema=ok untrusted_body_discarded=ok invalid_context_rejected=ok exact_server_refetch=ok'
);
