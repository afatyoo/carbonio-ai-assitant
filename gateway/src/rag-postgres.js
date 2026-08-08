import { randomUUID } from 'node:crypto';

import pg from 'pg';

import { decryptRagText, encryptRagText } from './rag-crypto.js';
import { embedPrivateText } from './rag-embeddings.js';
import { RAG_MODULES, RAG_SOURCE_CAPABILITIES, assertRagModule } from './rag-modules.js';
import { cosineSimilarity, lexicalEmbedding } from './rag-text.js';

const { Pool } = pg;
const connectionString = process.env.AI_RAG_ROLE === 'worker'
	? process.env.AI_RAG_WORKER_DATABASE_URL
	: process.env.AI_DATABASE_URL;
if (!connectionString) throw new Error('RAG database connection is not configured');
const pool = new Pool({
	connectionString,
	max: Math.min(Math.max(Number(process.env.AI_RAG_DATABASE_POOL_SIZE ?? 6), 2), 20),
	idleTimeoutMillis: 30_000,
	connectionTimeoutMillis: 5_000,
	ssl: process.env.AI_DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : false
});

const schema = `
	CREATE TABLE IF NOT EXISTS rag_schema_migrations (
		version INTEGER PRIMARY KEY,
		applied_at BIGINT NOT NULL
	);
	CREATE TABLE IF NOT EXISTS rag_sources (
		owner_id TEXT NOT NULL,
		module TEXT NOT NULL,
		enabled BOOLEAN NOT NULL DEFAULT FALSE,
		status TEXT NOT NULL DEFAULT 'disabled',
		last_sync_at BIGINT,
		indexed_documents INTEGER NOT NULL DEFAULT 0,
		indexed_chunks INTEGER NOT NULL DEFAULT 0,
		last_error TEXT,
		updated_at BIGINT NOT NULL,
		PRIMARY KEY (owner_id, module)
	);
	CREATE TABLE IF NOT EXISTS rag_documents (
		owner_id TEXT NOT NULL,
		module TEXT NOT NULL,
		source_id TEXT NOT NULL,
		revision TEXT NOT NULL,
		title TEXT NOT NULL,
		deep_link TEXT NOT NULL,
		metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
		content_encrypted TEXT NOT NULL,
		updated_at BIGINT NOT NULL,
		PRIMARY KEY (owner_id, module, source_id)
	);
	CREATE TABLE IF NOT EXISTS rag_chunks (
		owner_id TEXT NOT NULL,
		module TEXT NOT NULL,
		source_id TEXT NOT NULL,
		position INTEGER NOT NULL,
		title TEXT NOT NULL,
		deep_link TEXT NOT NULL,
		content_encrypted TEXT NOT NULL,
		search_vector TSVECTOR NOT NULL,
		embedding JSONB NOT NULL,
		suspicious BOOLEAN NOT NULL DEFAULT FALSE,
		updated_at BIGINT NOT NULL,
		PRIMARY KEY (owner_id, module, source_id, position),
		FOREIGN KEY (owner_id, module, source_id)
			REFERENCES rag_documents(owner_id, module, source_id) ON DELETE CASCADE
	);
	CREATE INDEX IF NOT EXISTS rag_chunks_search_gin ON rag_chunks USING GIN(search_vector);
	CREATE INDEX IF NOT EXISTS rag_chunks_owner_module ON rag_chunks(owner_id, module, updated_at DESC);
	CREATE TABLE IF NOT EXISTS rag_tombstones (
		owner_id TEXT NOT NULL,
		module TEXT NOT NULL,
		source_id TEXT NOT NULL,
		deleted_at BIGINT NOT NULL,
		expires_at BIGINT NOT NULL,
		PRIMARY KEY (owner_id, module, source_id)
	);
	CREATE TABLE IF NOT EXISTS rag_jobs (
		id TEXT PRIMARY KEY,
		owner_id TEXT NOT NULL,
		module TEXT NOT NULL,
		operation TEXT NOT NULL,
		payload_encrypted TEXT NOT NULL,
		status TEXT NOT NULL DEFAULT 'queued',
		attempts INTEGER NOT NULL DEFAULT 0,
		available_at BIGINT NOT NULL,
		created_at BIGINT NOT NULL,
		updated_at BIGINT NOT NULL,
		last_error TEXT
	);
	CREATE INDEX IF NOT EXISTS rag_jobs_queue ON rag_jobs(status, available_at, created_at);
`;

const rlsTables = ['rag_sources', 'rag_documents', 'rag_chunks', 'rag_tombstones'];

let pgvectorAvailable = false;
const initialize = async () => {
	const client = await pool.connect();
	try {
		if (process.env.AI_RAG_ROLE === 'worker') {
			const ready = await client.query("SELECT to_regclass('public.rag_jobs') AS jobs");
			if (!ready.rows[0]?.jobs) throw new Error('RAG schema is not initialized by the gateway');
			const vector = await client.query("SELECT 1 FROM pg_extension WHERE extname='vector'");
			pgvectorAvailable = Boolean(vector.rowCount);
			return;
		}
		await client.query('SELECT pg_advisory_lock(1128352331)');
		await client.query(schema);
		for (const table of rlsTables) {
			await client.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
			await client.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
			await client.query(`DROP POLICY IF EXISTS owner_isolation ON ${table}`);
			await client.query(`
				CREATE POLICY owner_isolation ON ${table}
				USING (owner_id = current_setting('carbonio_ai.owner_id', true))
				WITH CHECK (owner_id = current_setting('carbonio_ai.owner_id', true))
			`);
		}
		await client.query(
			`INSERT INTO rag_schema_migrations(version, applied_at) VALUES (1, $1)
			 ON CONFLICT(version) DO NOTHING`,
			[Date.now()]
		);
		const available = await client.query(
			"SELECT 1 FROM pg_available_extensions WHERE name = 'vector'"
		);
		if (available.rowCount) {
			await client.query('CREATE EXTENSION IF NOT EXISTS vector');
			await client.query('ALTER TABLE rag_chunks ADD COLUMN IF NOT EXISTS embedding_vector vector(384)');
			await client.query(
				'CREATE INDEX IF NOT EXISTS rag_chunks_embedding_hnsw ON rag_chunks USING hnsw (embedding_vector vector_cosine_ops)'
			);
			pgvectorAvailable = true;
		}
	} finally {
		if (process.env.AI_RAG_ROLE !== 'worker') {
			await client.query('SELECT pg_advisory_unlock(1128352331)').catch(() => {});
		}
		client.release();
	}
};

await initialize();

const withOwner = async (ownerId, callback) => {
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		await client.query("SELECT set_config('carbonio_ai.owner_id', $1, true)", [String(ownerId)]);
		const result = await callback(client);
		await client.query('COMMIT');
		return result;
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	} finally {
		client.release();
	}
};

const parseSource = (row, module) => ({
	module,
	label: RAG_SOURCE_CAPABILITIES[module].label,
	available: RAG_SOURCE_CAPABILITIES[module].available,
	unavailableReason: RAG_SOURCE_CAPABILITIES[module].reason ?? '',
	enabled: Boolean(row?.enabled),
	status: row?.status ?? 'disabled',
	lastSyncAt: row?.last_sync_at == null ? null : Number(row.last_sync_at),
	indexedDocuments: Number(row?.indexed_documents ?? 0),
	indexedChunks: Number(row?.indexed_chunks ?? 0),
	lastError: row?.last_error ?? '',
	updatedAt: row?.updated_at == null ? null : Number(row.updated_at)
});

export const listRagSources = (ownerId) =>
	withOwner(ownerId, async (client) => {
		const result = await client.query('SELECT * FROM rag_sources WHERE owner_id = $1', [ownerId]);
		const rows = new Map(result.rows.map((row) => [row.module, row]));
		return RAG_MODULES.map((module) => parseSource(rows.get(module), module));
	});

export const setRagSource = (ownerId, moduleValue, enabled) => {
	const module = assertRagModule(moduleValue);
	const now = Date.now();
	return withOwner(ownerId, async (client) => {
		await client.query(
			`INSERT INTO rag_sources(owner_id, module, enabled, status, updated_at)
			 VALUES ($1, $2, $3, $4, $5)
			 ON CONFLICT(owner_id, module) DO UPDATE SET
			 enabled = EXCLUDED.enabled, status = EXCLUDED.status,
			 last_error = NULL, updated_at = EXCLUDED.updated_at`,
			[ownerId, module, Boolean(enabled), enabled ? 'ready_to_sync' : 'disabled', now]
		);
		if (!enabled) {
			await client.query('DELETE FROM rag_documents WHERE owner_id = $1 AND module = $2', [
				ownerId,
				module
			]);
			await client.query('DELETE FROM rag_jobs WHERE owner_id = $1 AND module = $2', [ownerId, module]);
			await client.query(
				`UPDATE rag_sources SET indexed_documents = 0, indexed_chunks = 0
				 WHERE owner_id = $1 AND module = $2`,
				[ownerId, module]
			);
		}
		const result = await client.query(
			'SELECT * FROM rag_sources WHERE owner_id = $1 AND module = $2',
			[ownerId, module]
		);
		return parseSource(result.rows[0], module);
	});
};

export const enqueueRagDocuments = (ownerId, moduleValue, documents) => {
	const module = assertRagModule(moduleValue);
	if (!Array.isArray(documents) || documents.length > 2_000) {
		throw new Error('AI source synchronization exceeds the 2,000 document safety limit');
	}
	return withOwner(ownerId, async (client) => {
		const source = await client.query(
			'SELECT enabled FROM rag_sources WHERE owner_id = $1 AND module = $2 FOR UPDATE',
			[ownerId, module]
		);
		if (!source.rows[0]?.enabled) throw new Error('AI source must be enabled before syncing');
		const active = await client.query(
			"SELECT 1 FROM rag_jobs WHERE owner_id=$1 AND module=$2 AND status='processing' LIMIT 1",
			[ownerId, module]
		);
		if (active.rowCount) {
			const error = new Error('AI source synchronization is already running');
			error.statusCode = 409;
			throw error;
		}
		await client.query(
			`UPDATE rag_sources SET status = 'syncing', last_error = NULL, updated_at = $3
			 WHERE owner_id = $1 AND module = $2`,
			[ownerId, module, Date.now()]
		);
		await client.query(
			"DELETE FROM rag_jobs WHERE owner_id=$1 AND module=$2 AND status IN ('queued','failed')",
			[ownerId, module]
		);
		const syncStartedAt = Date.now();
		for (const [index, document] of documents.entries()) {
			const id = randomUUID();
			const payload = JSON.stringify({ ...document, module });
			await client.query(
				`INSERT INTO rag_jobs
				 (id, owner_id, module, operation, payload_encrypted, status, available_at, created_at, updated_at)
				 VALUES ($1, $2, $3, 'upsert', $4, 'queued', $5, $5, $5)`,
				[id, ownerId, module, encryptRagText(ownerId, 'job', id, payload), syncStartedAt + index]
			);
		}
		const finalizeId = randomUUID();
		await client.query(
			`INSERT INTO rag_jobs
			 (id, owner_id, module, operation, payload_encrypted, status, available_at, created_at, updated_at)
			 VALUES ($1, $2, $3, 'finalize', $4, 'queued', $5, $5, $5)`,
			[
				finalizeId,
				ownerId,
				module,
				encryptRagText(ownerId, 'job', finalizeId, JSON.stringify({ sourceIds: documents.map(({ id }) => String(id)) })),
				syncStartedAt + documents.length
			]
		);
		return { module, queued: documents.length };
	});
};

export const claimRagJob = async () => {
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		const result = await client.query(
			`SELECT * FROM rag_jobs
			 WHERE status = 'queued' AND available_at <= $1
			 ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED`,
			[Date.now()]
		);
		const row = result.rows[0];
		if (!row) {
			await client.query('COMMIT');
			return null;
		}
		await client.query(
			`UPDATE rag_jobs SET status = 'processing', attempts = attempts + 1, updated_at = $2
			 WHERE id = $1`,
			[row.id, Date.now()]
		);
		await client.query('COMMIT');
		return {
			id: row.id,
			ownerId: row.owner_id,
			module: row.module,
			operation: row.operation,
			attempts: Number(row.attempts) + 1,
			payload: JSON.parse(decryptRagText(row.owner_id, 'job', row.id, row.payload_encrypted))
		};
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	} finally {
		client.release();
	}
};

export const completeRagJob = (job, document, chunks) =>
	withOwner(job.ownerId, async (client) => {
		const now = Date.now();
		await client.query(
			`INSERT INTO rag_documents
			 (owner_id, module, source_id, revision, title, deep_link, metadata, content_encrypted, updated_at)
			 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
			 ON CONFLICT(owner_id,module,source_id) DO UPDATE SET
			 revision=EXCLUDED.revision,title=EXCLUDED.title,deep_link=EXCLUDED.deep_link,
			 metadata=EXCLUDED.metadata,content_encrypted=EXCLUDED.content_encrypted,updated_at=EXCLUDED.updated_at`,
			[
				job.ownerId,
				job.module,
				document.id,
				String(document.revision ?? ''),
				document.title,
				document.deepLink,
				document.metadata ?? {},
				encryptRagText(job.ownerId, 'document', `${job.module}:${document.id}`, document.content),
				now
			]
		);
		await client.query(
			'DELETE FROM rag_chunks WHERE owner_id=$1 AND module=$2 AND source_id=$3',
			[job.ownerId, job.module, document.id]
		);
		for (let position = 0; position < chunks.length; position += 1) {
			const chunk = chunks[position];
			await client.query(
				`INSERT INTO rag_chunks
				 (owner_id,module,source_id,position,title,deep_link,content_encrypted,search_vector,embedding,suspicious,updated_at)
				 VALUES ($1,$2,$3,$4,$5,$6,$7,to_tsvector('simple',$8),$9,$10,$11)`,
				[
					job.ownerId,
					job.module,
					document.id,
					position,
					document.title,
					document.deepLink,
					encryptRagText(job.ownerId, 'chunk', `${job.module}:${document.id}:${position}`, chunk.content),
					chunk.content,
					JSON.stringify(chunk.embedding),
					Boolean(chunk.suspicious),
					now
				]
			);
			if (pgvectorAvailable) {
				await client.query(
					`UPDATE rag_chunks SET embedding_vector=$5::vector
					 WHERE owner_id=$1 AND module=$2 AND source_id=$3 AND position=$4`,
					[job.ownerId, job.module, document.id, position, `[${chunk.embedding.join(',')}]`]
				);
			}
		}
		await client.query('DELETE FROM rag_jobs WHERE id = $1', [job.id]);
		const pending = await client.query(
			`SELECT COUNT(*)::int AS count FROM rag_jobs
			 WHERE owner_id=$1 AND module=$2 AND status IN ('queued','processing')`,
			[job.ownerId, job.module]
		);
		if (Number(pending.rows[0].count) === 0) {
			await client.query(
				`UPDATE rag_sources SET status='ready',last_sync_at=$3,updated_at=$3,
				 indexed_documents=(SELECT COUNT(*) FROM rag_documents WHERE owner_id=$1 AND module=$2),
				 indexed_chunks=(SELECT COUNT(*) FROM rag_chunks WHERE owner_id=$1 AND module=$2)
				 WHERE owner_id=$1 AND module=$2`,
				[job.ownerId, job.module, now]
			);
		}
	});

export const finalizeRagSync = (job) =>
	withOwner(job.ownerId, async (client) => {
		const sourceIds = Array.isArray(job.payload.sourceIds)
			? job.payload.sourceIds.map(String).slice(0, 2_000)
			: [];
		const stale = await client.query(
			`SELECT source_id FROM rag_documents
			 WHERE owner_id=$1 AND module=$2 AND NOT (source_id = ANY($3::text[]))`,
			[job.ownerId, job.module, sourceIds]
		);
		for (const row of stale.rows) {
			await client.query(
				`INSERT INTO rag_tombstones(owner_id,module,source_id,deleted_at,expires_at)
				 VALUES($1,$2,$3,$4,$5)
				 ON CONFLICT(owner_id,module,source_id) DO UPDATE SET
				 deleted_at=EXCLUDED.deleted_at,expires_at=EXCLUDED.expires_at`,
				[job.ownerId, job.module, row.source_id, Date.now(), Date.now() + 30 * 86_400_000]
			);
		}
		await client.query(
			`DELETE FROM rag_documents
			 WHERE owner_id=$1 AND module=$2 AND NOT (source_id = ANY($3::text[]))`,
			[job.ownerId, job.module, sourceIds]
		);
		await client.query('DELETE FROM rag_jobs WHERE id=$1', [job.id]);
		await client.query(
			`UPDATE rag_sources SET status='ready',last_sync_at=$3,updated_at=$3,last_error=NULL,
			 indexed_documents=(SELECT COUNT(*) FROM rag_documents WHERE owner_id=$1 AND module=$2),
			 indexed_chunks=(SELECT COUNT(*) FROM rag_chunks WHERE owner_id=$1 AND module=$2)
			 WHERE owner_id=$1 AND module=$2`,
			[job.ownerId, job.module, Date.now()]
		);
		await client.query('DELETE FROM rag_tombstones WHERE expires_at < $1', [Date.now()]);
	});

export const failRagJob = async (job, error) => {
	const retry = job.attempts < 5;
	const delay = Math.min(60_000 * 2 ** Math.max(job.attempts - 1, 0), 3_600_000);
	await pool.query(
		`UPDATE rag_jobs SET status=$2,available_at=$3,updated_at=$4,last_error=$5 WHERE id=$1`,
		[job.id, retry ? 'queued' : 'failed', Date.now() + delay, Date.now(), String(error.message).slice(0, 500)]
	);
	if (!retry) {
		await withOwner(job.ownerId, (client) =>
			client.query(
				`UPDATE rag_sources SET status='error',last_error=$3,updated_at=$4
				 WHERE owner_id=$1 AND module=$2`,
				[job.ownerId, job.module, String(error.message).slice(0, 500), Date.now()]
			)
		);
	}
};

export const retrievePrivateRag = (ownerId, query, { limit = 8 } = {}) =>
	withOwner(ownerId, async (client) => {
		const boundedLimit = Math.min(Math.max(Number(limit) || 8, 1), 12);
		const enabled = await client.query(
			`SELECT module FROM rag_sources WHERE owner_id=$1 AND enabled=TRUE AND status='ready'`,
			[ownerId]
		);
		if (!enabled.rowCount) return [];
		const lexicalResult = await client.query(
			`SELECT c.*, d.metadata, d.revision,
			 ts_rank_cd(c.search_vector, websearch_to_tsquery('simple',$2)) AS lexical_rank
			 FROM rag_chunks c JOIN rag_sources s
			 ON s.owner_id=c.owner_id AND s.module=c.module
			 JOIN rag_documents d ON d.owner_id=c.owner_id AND d.module=c.module AND d.source_id=c.source_id
			 WHERE c.owner_id=$1 AND s.enabled=TRUE
			 AND c.search_vector @@ websearch_to_tsquery('simple',$2)
			 ORDER BY lexical_rank DESC, c.updated_at DESC LIMIT 80`,
			[ownerId, String(query).slice(0, 2_000)]
		);
		let queryEmbedding;
		let semanticAvailable = true;
		try {
			queryEmbedding = await embedPrivateText(query);
		} catch {
			queryEmbedding = lexicalEmbedding(query);
			semanticAvailable = false;
		}
		const semanticResult = pgvectorAvailable && semanticAvailable
			? await client.query(
					`SELECT c.*, d.metadata, d.revision FROM rag_chunks c JOIN rag_sources s
					 ON s.owner_id=c.owner_id AND s.module=c.module
					 JOIN rag_documents d ON d.owner_id=c.owner_id AND d.module=c.module AND d.source_id=c.source_id
					 WHERE c.owner_id=$1 AND s.enabled=TRUE AND c.embedding_vector IS NOT NULL
					 ORDER BY c.embedding_vector <=> $2::vector LIMIT 40`,
					[ownerId, `[${queryEmbedding.join(',')}]`]
				)
			: { rows: [] };
		const fused = new Map();
		for (const [kind, rows] of [['lexical', lexicalResult.rows], ['semantic', semanticResult.rows]]) {
			rows.forEach((row, rank) => {
				const id = `${row.module}:${row.source_id}:${row.position}`;
				const current = fused.get(id) ?? { row, score: 0 };
				current.score += 1 / (60 + rank + 1);
				current[kind] = true;
				fused.set(id, current);
			});
		}
		return [...fused.values()]
			.map(({ row, score: rrfScore, lexical }) => {
				const content = decryptRagText(
					ownerId,
					'chunk',
					`${row.module}:${row.source_id}:${row.position}`,
					row.content_encrypted
				);
				const vectorRank = semanticAvailable ? cosineSimilarity(queryEmbedding, row.embedding) : 0;
				return {
					id: `${row.module}:${row.source_id}:${row.position}`,
					module: row.module,
					sourceId: row.source_id,
					title: row.title,
					content,
					deepLink: row.deep_link,
					metadata: row.metadata ?? {},
					revision: row.revision,
					suspicious: Boolean(row.suspicious),
					score: rrfScore + Math.max(vectorRank, 0) * 0.01,
					matchedLexical: Boolean(lexical),
					vectorSimilarity: vectorRank
				};
			})
			.filter(
				({ matchedLexical, vectorSimilarity }) =>
					matchedLexical ||
					(semanticAvailable &&
						vectorSimilarity >= Number(process.env.AI_RAG_RELEVANCE_THRESHOLD ?? 0.35))
			)
			.sort((left, right) => right.score - left.score)
			.slice(0, boundedLimit)
			.map(({ matchedLexical, vectorSimilarity, ...result }) => result);
	});

export const getRagStatus = async () => {
	const vector = await pool.query("SELECT 1 FROM pg_extension WHERE extname='vector'");
	const queue = await pool.query(
		"SELECT COUNT(*)::int AS count FROM rag_jobs WHERE status IN ('queued','processing')"
	);
	return { backend: 'postgresql', pgvector: Boolean(vector.rowCount), queuedJobs: Number(queue.rows[0].count) };
};

export const purgeRagOwnerForTest = (ownerId) =>
	withOwner(ownerId, async (client) => {
		await client.query('DELETE FROM rag_documents WHERE owner_id=$1', [ownerId]);
		await client.query('DELETE FROM rag_tombstones WHERE owner_id=$1', [ownerId]);
		await client.query('DELETE FROM rag_sources WHERE owner_id=$1', [ownerId]);
		await client.query('DELETE FROM rag_jobs WHERE owner_id=$1', [ownerId]);
	});

export const closeRagDatabase = () => pool.end();
