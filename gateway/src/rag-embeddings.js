import { fetchWithRetry } from './fetch-with-retry.js';
import { lexicalEmbedding } from './rag-text.js';

const dimensions = 384;

const assertEmbeddingUrl = (value) => {
	const url = new URL(value);
	if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid embedding endpoint protocol');
	const allowedHosts = new Set(
		(process.env.AI_RAG_EMBEDDING_HOSTS ?? '127.0.0.1,localhost,::1')
			.split(',')
			.map((item) => item.trim().toLowerCase())
			.filter(Boolean)
	);
	if (!allowedHosts.has(url.hostname.toLowerCase())) {
		throw new Error('Embedding endpoint host is not allowlisted');
	}
	return url;
};

export const embedPrivateText = async (text, { signal } = {}) => {
	const endpoint = String(process.env.AI_RAG_EMBEDDING_URL ?? '').trim();
	if (!endpoint) return lexicalEmbedding(text, dimensions);
	const response = await fetchWithRetry(assertEmbeddingUrl(endpoint), {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			model: process.env.AI_RAG_EMBEDDING_MODEL || 'local-private-embedding',
			input: String(text).slice(0, 20_000),
			dimensions
		}),
		signal
	});
	if (!response.ok) throw new Error(`Self-hosted embedding endpoint returned HTTP ${response.status}`);
	const payload = await response.json();
	const vector = payload.data?.[0]?.embedding ?? payload.embedding;
	if (!Array.isArray(vector) || vector.length !== dimensions || vector.some((entry) => !Number.isFinite(Number(entry)))) {
		throw new Error(`Embedding endpoint must return exactly ${dimensions} finite dimensions`);
	}
	return vector.map(Number);
};
