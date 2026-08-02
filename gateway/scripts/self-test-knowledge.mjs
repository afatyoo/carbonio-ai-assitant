import {
	appendKnowledgeSources,
	getKnowledgeMetadata,
	retrieveKnowledge,
	shouldRetrieveKnowledge
} from '../src/knowledge.js';
import { runAgent } from '../src/agent.js';

const draftResults = retrieveKnowledge('Bagaimana cara membuat draft email di Carbonio?');
if (draftResults.length === 0 || !draftResults.some(({ id }) => id.includes('draft'))) {
	throw new Error('Draft query did not retrieve SaveDraft guidance');
}

const sendResults = retrieveKnowledge('Kirim saved draft menggunakan did dan sfd');
if (sendResults[0]?.id !== 'send-message') {
	throw new Error(`Send query returned an unexpected top result: ${sendResults[0]?.id}`);
}

const unrelatedResults = retrieveKnowledge('berapa harga bitcoin hari ini');
if (unrelatedResults.length !== 0) {
	throw new Error('Unrelated query should not retrieve Carbonio email documentation');
}

if (shouldRetrieveKnowledge('Ringkas email yang belum dibaca hari ini')) {
	throw new Error('Mailbox summary should not activate documentation RAG');
}
if (!shouldRetrieveKnowledge('Buat draft balasan untuk email terakhir')) {
	throw new Error('Draft request should activate documentation RAG');
}

const answer = appendKnowledgeSources('Gunakan SaveDraftRequest.', draftResults.slice(0, 1));
if (!answer.includes('https://docs.zextras.com/apidoc/api-reference/')) {
	throw new Error('Knowledge answer did not include an official citation');
}

const metadata = getKnowledgeMetadata();

const events = [];
await runAgent({
	message: 'Bagaimana cara membuat draft email dengan Carbonio API?',
	model: '',
	cookie: '',
	emit: (event, data) => events.push({ event, data })
});
const agentText = events
	.filter(({ event }) => event === 'message')
	.map(({ data }) => data.text)
	.join('');
if (!events.some(({ event, data }) => event === 'tool' && data.name === 'search_carbonio_docs')) {
	throw new Error('Agent did not emit documentation retrieval status');
}
if (!agentText.includes('https://docs.zextras.com/apidoc/api-reference/')) {
	throw new Error('Agent documentation answer did not preserve official citations');
}

console.log(
	`knowledge_retrieval=ok knowledge_citation=ok agent_grounding=ok chunks=${metadata.chunkCount} version=${metadata.version}`
);
