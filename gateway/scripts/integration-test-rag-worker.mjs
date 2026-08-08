import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

if (!process.env.AI_DATABASE_URL || !process.env.AI_HISTORY_ENCRYPTION_KEY) {
	throw new Error('AI_DATABASE_URL and AI_HISTORY_ENCRYPTION_KEY are required');
}

const {
	closeRagDatabase,
	enqueueRagDocuments,
	listRagSources,
	purgeRagOwnerForTest,
	retrievePrivateRag,
	setRagSource
} = await import('../src/rag-postgres.js');

const ownerId = `rag-worker-test-${randomUUID()}`;
const uniqueToken = `worker-evidence-${randomUUID()}`;
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

try {
	await setRagSource(ownerId, 'mail', true);
	await enqueueRagDocuments(ownerId, 'mail', [
		{
			id: 'synthetic-440',
			revision: '1',
			title: 'Synthetic worker evidence',
			deepLink: '/mails/message/synthetic-440',
			metadata: {},
			content: `Private synthetic evidence ${uniqueToken}`
		}
	]);
	let source;
	for (let attempt = 0; attempt < 40; attempt += 1) {
		[source] = (await listRagSources(ownerId)).filter(({ module }) => module === 'mail');
		if (source.status === 'ready') break;
		await wait(250);
	}
	assert.equal(source.status, 'ready');
	assert.equal(source.indexedDocuments, 1);
	assert.ok((await retrievePrivateRag(ownerId, uniqueToken)).some(({ content }) => content.includes(uniqueToken)));
	assert.deepEqual(await retrievePrivateRag(ownerId, 'unrelated-no-evidence-token'), []);
	await setRagSource(ownerId, 'mail', false);
	assert.deepEqual(await retrievePrivateRag(ownerId, uniqueToken), []);
	console.log('rag_worker_integration=ok encrypted_queue=processed retrieval=isolated removal=immediate');
} finally {
	await purgeRagOwnerForTest(ownerId);
	await closeRagDatabase();
}
