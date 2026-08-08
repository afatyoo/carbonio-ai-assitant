import { RAG_MODULES, RAG_SOURCE_CAPABILITIES } from './rag-modules.js';

const disabledSources = () =>
	RAG_MODULES.map((module) => ({
		module,
		label: RAG_SOURCE_CAPABILITIES[module].label,
		available: false,
		unavailableReason: process.env.AI_DATABASE_URL
			? RAG_SOURCE_CAPABILITIES[module].reason ?? 'Private retrieval is unavailable'
			: 'PostgreSQL is required for private AI sources',
		enabled: false,
		status: 'unavailable',
		lastSyncAt: null,
		indexedDocuments: 0,
		indexedChunks: 0,
		lastError: '',
		updatedAt: null
	}));

const backend = process.env.AI_DATABASE_URL ? await import('./rag-postgres.js') : null;

export const ragBackend = backend ? 'postgresql' : 'disabled';
export const listRagSources = (ownerId) =>
	backend ? backend.listRagSources(ownerId) : Promise.resolve(disabledSources());
export const setRagSource = (...args) => {
	if (!backend) throw new Error('PostgreSQL is required for private AI sources');
	return backend.setRagSource(...args);
};
export const enqueueRagDocuments = (...args) => {
	if (!backend) throw new Error('PostgreSQL is required for private AI sources');
	return backend.enqueueRagDocuments(...args);
};
export const retrievePrivateRag = (ownerId, query, options) =>
	backend ? backend.retrievePrivateRag(ownerId, query, options) : Promise.resolve([]);
export const getRagStatus = () =>
	backend ? backend.getRagStatus() : Promise.resolve({ backend: 'disabled', pgvector: false, queuedJobs: 0 });
export const closeRagDatabase = () => Promise.resolve(backend?.closeRagDatabase());
