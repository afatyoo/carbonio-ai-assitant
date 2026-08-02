import { readFileSync } from 'node:fs';

const knowledgeUrl = new URL('../knowledge/carbonio-email-api.json', import.meta.url);
const dataset = JSON.parse(readFileSync(knowledgeUrl, 'utf8'));

if (!Array.isArray(dataset.chunks) || dataset.chunks.length === 0) {
	throw new Error('Carbonio knowledge dataset is empty');
}

const stopWords = new Set([
	'a',
	'ada',
	'apa',
	'and',
	'atau',
	'bagaimana',
	'buat',
	'cara',
	'dan',
	'dari',
	'dengan',
	'di',
	'for',
	'how',
	'ini',
	'ke',
	'of',
	'on',
	'the',
	'to',
	'untuk',
	'yang'
]);

const aliases = new Map([
	['balas', ['reply', 'origid']],
	['draft', ['savedraft']],
	['email', ['message', 'mail']],
	['kirim', ['send', 'sendmsg']],
	['lampiran', ['attachment', 'attach']],
	['teruskan', ['forward', 'origid']]
]);

const normalize = (value) =>
	String(value ?? '')
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();

const tokenize = (value) => {
	const terms = new Set(
		normalize(value)
			.split(/\s+/)
			.filter((term) => term.length > 1 && !stopWords.has(term))
	);
	for (const term of [...terms]) {
		for (const alias of aliases.get(term) ?? []) terms.add(alias);
	}
	return [...terms];
};

const preparedChunks = dataset.chunks.map((chunk) => ({
	...chunk,
	titleText: normalize(chunk.title),
	keywordText: normalize(chunk.keywords.join(' ')),
	contentText: normalize(chunk.content),
	titleTerms: new Set(normalize(chunk.title).split(/\s+/)),
	keywordTerms: new Set(normalize(chunk.keywords.join(' ')).split(/\s+/)),
	contentTerms: new Set(normalize(chunk.content).split(/\s+/))
}));

const scoreChunk = (query, terms, chunk) => {
	let score = 0;
	for (const term of terms) {
		if (chunk.titleTerms.has(term)) score += 5;
		if (chunk.keywordTerms.has(term)) score += 3;
		if (chunk.contentTerms.has(term)) score += 1;
		if (
			/^(aid|did|idnt|irt|nosave|origid|sfd|suid|wantcontent)$/.test(term) &&
			chunk.keywordTerms.has(term)
		) {
			score += 6;
		}
	}
	const normalizedQuery = normalize(query);
	if (normalizedQuery.length > 5 && chunk.contentText.includes(normalizedQuery)) score += 8;
	return score;
};

export const retrieveKnowledge = (query, { limit = 4, minScore = 2 } = {}) => {
	const terms = tokenize(query);
	if (terms.length === 0) return [];
	return preparedChunks
		.map((chunk) => ({ ...chunk, score: scoreChunk(query, terms, chunk) }))
		.filter((chunk) => chunk.score >= minScore)
		.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
		.slice(0, Math.min(Math.max(Number(limit) || 4, 1), 6))
		.map(
			({ titleText, keywordText, contentText, titleTerms, keywordTerms, contentTerms, ...chunk }) =>
				chunk
		);
};

export const shouldRetrieveKnowledge = (query) =>
	/(savedraft|sendmsg|soap|api reference|carbonio api|urn:zimbraMail)/i.test(query) ||
	/(bagaimana|cara|panduan|how to).*(email|mail|draft|attachment|lampiran)/i.test(query) ||
	/(buat|membuat|create|compose|update|balas|reply|forward|teruskan|kirim|send).*(draft|email|mail)/i.test(
		query
	) ||
	/(draft|email|mail).*(attachment|lampiran)/i.test(query);

export const getKnowledgeMetadata = () => ({
	dataset: dataset.dataset,
	version: dataset.version,
	language: dataset.language,
	scope: dataset.scope,
	chunkCount: dataset.chunks.length
});

export const formatKnowledgeContext = (results) =>
	results
		.map(
			(result, index) =>
				`[K${index + 1}] ${result.title}\nSource: ${result.url}\n${result.content}`
		)
		.join('\n\n');

export const appendKnowledgeSources = (answer, results) => {
	if (results.length === 0) return answer;
	const uniqueSources = [];
	const seen = new Set();
	for (const result of results) {
		if (seen.has(result.url)) continue;
		seen.add(result.url);
		uniqueSources.push(`- [${result.title}](${result.url})`);
	}
	return `${answer.trim()}\n\nSources:\n${uniqueSources.join('\n')}`;
};
