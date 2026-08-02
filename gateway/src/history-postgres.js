import pg from 'pg';

import { decryptHistoryText, encryptHistoryText } from './history-crypto.js';

const { Pool } = pg;
const pool = new Pool({
	connectionString: process.env.AI_DATABASE_URL,
	max: Math.min(Math.max(Number(process.env.AI_DATABASE_POOL_SIZE ?? 10), 2), 30),
	idleTimeoutMillis: 30_000,
	connectionTimeoutMillis: 5_000,
	ssl: process.env.AI_DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : false
});

await pool.query(`
	CREATE TABLE IF NOT EXISTS schema_migrations (
		version INTEGER PRIMARY KEY,
		applied_at BIGINT NOT NULL
	)
`);

const migrations = [
	{
		version: 1,
		sql: `
			CREATE TABLE IF NOT EXISTS conversations (
				owner_id TEXT NOT NULL,
				id TEXT NOT NULL,
				title TEXT NOT NULL,
				model TEXT NOT NULL,
				message_count INTEGER NOT NULL DEFAULT 0,
				created_at BIGINT NOT NULL,
				updated_at BIGINT NOT NULL,
				deleted_at BIGINT,
				PRIMARY KEY (owner_id, id)
			);
			CREATE INDEX IF NOT EXISTS conversations_owner_deleted_updated
			ON conversations(owner_id, deleted_at, updated_at DESC, id DESC);
			CREATE TABLE IF NOT EXISTS messages (
				owner_id TEXT NOT NULL,
				conversation_id TEXT NOT NULL,
				position INTEGER NOT NULL,
				message_id TEXT NOT NULL,
				role TEXT NOT NULL CHECK (role IN ('assistant', 'user')),
				text_encrypted TEXT NOT NULL,
				PRIMARY KEY (owner_id, conversation_id, position),
				FOREIGN KEY (owner_id, conversation_id)
					REFERENCES conversations(owner_id, id) ON DELETE CASCADE
			);
			CREATE INDEX IF NOT EXISTS messages_conversation_position
			ON messages(owner_id, conversation_id, position);
		`
	}
];

for (const migration of migrations) {
	const applied = await pool.query('SELECT 1 FROM schema_migrations WHERE version = $1', [
		migration.version
	]);
	if (applied.rowCount) continue;
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		await client.query(migration.sql);
		await client.query('INSERT INTO schema_migrations(version, applied_at) VALUES ($1, $2)', [
			migration.version,
			Date.now()
		]);
		await client.query('COMMIT');
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	} finally {
		client.release();
	}
}

const deletedRetentionDays = Math.min(
	Math.max(Number(process.env.AI_DELETED_HISTORY_RETENTION_DAYS ?? 30), 1),
	3650
);
await pool.query(
	'DELETE FROM conversations WHERE deleted_at IS NOT NULL AND deleted_at < $1',
	[Date.now() - deletedRetentionDays * 86_400_000]
);

const normalizeLimit = (limit) => {
	const parsed = Number(limit);
	if (!Number.isInteger(parsed)) return 20;
	return Math.min(Math.max(parsed, 1), 50);
};

const encodeCursor = ({ updatedAt, id }) =>
	Buffer.from(JSON.stringify([updatedAt, id]), 'utf8').toString('base64url');

const decodeCursor = (cursor) => {
	if (!cursor) return null;
	try {
		const [updatedAt, id] = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
		if (!Number.isSafeInteger(updatedAt) || typeof id !== 'string' || !id) {
			throw new Error('Invalid cursor');
		}
		return { updatedAt, id };
	} catch {
		throw new Error('Invalid conversation cursor');
	}
};

const parseSummary = (row) => ({
	id: row.id,
	title: row.title,
	model: row.model,
	messageCount: Number(row.message_count),
	createdAt: Number(row.created_at),
	updatedAt: Number(row.updated_at),
	deletedAt: row.deleted_at == null ? null : Number(row.deleted_at)
});

const normalizeMessages = (messages) => {
	const normalized = Array.isArray(messages) ? messages : [];
	if (normalized.length > 500) throw new Error('Conversation exceeds 500 messages');
	for (const message of normalized) {
		if (
			!['assistant', 'user'].includes(message.role) ||
			typeof message.text !== 'string' ||
			message.text.length > 100_000
		) {
			throw new Error('Invalid conversation message');
		}
	}
	return normalized;
};

const getConversationRow = async (ownerId, id, includeDeleted = false, client = pool) => {
	const result = await client.query(
		`SELECT id, title, model, message_count, created_at, updated_at, deleted_at
		 FROM conversations WHERE owner_id = $1 AND id = $2
		 ${includeDeleted ? '' : 'AND deleted_at IS NULL'}`,
		[ownerId, id]
	);
	return result.rows[0] ?? null;
};

export const listConversationPage = async (
	ownerId,
	{ cursor = '', limit = 20, query = '' } = {}
) => {
	const pageSize = normalizeLimit(limit);
	const decodedCursor = decodeCursor(cursor);
	const normalizedQuery = String(query ?? '').trim().slice(0, 100);
	const parameters = [ownerId];
	const conditions = ['owner_id = $1', 'deleted_at IS NULL'];
	if (normalizedQuery) {
		parameters.push(`%${normalizedQuery.replace(/[\\%_]/g, '\\$&')}%`);
		conditions.push(`title ILIKE $${parameters.length} ESCAPE '\\'`);
	}
	if (decodedCursor) {
		parameters.push(decodedCursor.updatedAt, decodedCursor.id);
		conditions.push(
			`(updated_at < $${parameters.length - 1} OR (updated_at = $${
				parameters.length - 1
			} AND id < $${parameters.length}))`
		);
	}
	parameters.push(pageSize + 1);
	const result = await pool.query(
		`SELECT id, title, model, message_count, created_at, updated_at, deleted_at
		 FROM conversations WHERE ${conditions.join(' AND ')}
		 ORDER BY updated_at DESC, id DESC LIMIT $${parameters.length}`,
		parameters
	);
	const hasMore = result.rows.length > pageSize;
	const conversations = result.rows.slice(0, pageSize).map(parseSummary);
	const last = conversations.at(-1);
	return {
		conversations,
		nextCursor: hasMore && last ? encodeCursor(last) : null
	};
};

export const listConversations = async (ownerId) =>
	(await listConversationPage(ownerId, { limit: 50 })).conversations;

export const getConversation = async (ownerId, id) => {
	const row = await getConversationRow(ownerId, id, false);
	if (!row) return null;
	const messages = await pool.query(
		`SELECT position, message_id, role, text_encrypted FROM messages
		 WHERE owner_id = $1 AND conversation_id = $2 ORDER BY position`,
		[ownerId, id]
	);
	return {
		...parseSummary(row),
		messages: messages.rows.map((message) => {
			const numericId = Number(message.message_id);
			return {
				id: Number.isSafeInteger(numericId) ? numericId : message.message_id,
				role: message.role,
				text: decryptHistoryText(
					message.text_encrypted,
					`${ownerId}:${id}:${message.position}`
				)
			};
		})
	};
};

export const saveConversation = async (ownerId, conversation) => {
	const messages = normalizeMessages(conversation.messages);
	const client = await pool.connect();
	try {
		await client.query('BEGIN');
		const existing = await getConversationRow(ownerId, conversation.id, true, client);
		if (existing?.deleted_at != null) throw new Error('Conversation is deleted');
		const now = Date.now();
		const requestedCreatedAt = Number(conversation.createdAt);
		const requestedUpdatedAt = Number(conversation.updatedAt);
		const record = {
			id: conversation.id,
			title: String(conversation.title || 'New conversation').slice(0, 120),
			model: String(conversation.model || '').slice(0, 200),
			messages,
			messageCount: messages.length,
			createdAt:
				existing
					? Number(existing.created_at)
					: Number.isSafeInteger(requestedCreatedAt) && requestedCreatedAt > 0
						? Math.min(requestedCreatedAt, now)
						: now,
			updatedAt:
				Number.isSafeInteger(requestedUpdatedAt) && requestedUpdatedAt > 0
					? Math.min(requestedUpdatedAt, now)
					: now,
			deletedAt: null
		};
		await client.query(
			`INSERT INTO conversations
			 (owner_id, id, title, model, message_count, created_at, updated_at, deleted_at)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)
			 ON CONFLICT(owner_id, id) DO UPDATE SET
			 title = EXCLUDED.title, model = EXCLUDED.model,
			 message_count = EXCLUDED.message_count, updated_at = EXCLUDED.updated_at`,
			[
				ownerId,
				record.id,
				record.title,
				record.model,
				record.messageCount,
				record.createdAt,
				record.updatedAt
			]
		);
		await client.query('DELETE FROM messages WHERE owner_id = $1 AND conversation_id = $2', [
			ownerId,
			record.id
		]);
		for (const [position, message] of messages.entries()) {
			await client.query(
				`INSERT INTO messages
				 (owner_id, conversation_id, position, message_id, role, text_encrypted)
				 VALUES ($1, $2, $3, $4, $5, $6)`,
				[
					ownerId,
					record.id,
					position,
					String(message.id ?? position),
					message.role,
					encryptHistoryText(message.text, `${ownerId}:${record.id}:${position}`)
				]
			);
		}
		await client.query('COMMIT');
		return record;
	} catch (error) {
		await client.query('ROLLBACK');
		throw error;
	} finally {
		client.release();
	}
};

export const renameConversation = async (ownerId, id, title) => {
	const normalizedTitle = typeof title === 'string' ? title.trim().slice(0, 120) : '';
	if (!normalizedTitle) throw new Error('Conversation title is required');
	const result = await pool.query(
		`UPDATE conversations SET title = $1, updated_at = $2
		 WHERE owner_id = $3 AND id = $4 AND deleted_at IS NULL`,
		[normalizedTitle, Date.now(), ownerId, id]
	);
	return result.rowCount ? getConversation(ownerId, id) : null;
};

export const deleteConversation = async (ownerId, id) => {
	const now = Date.now();
	const result = await pool.query(
		`UPDATE conversations SET deleted_at = $1, updated_at = $1
		 WHERE owner_id = $2 AND id = $3 AND deleted_at IS NULL
		 RETURNING id, title, model, message_count, created_at, updated_at, deleted_at`,
		[now, ownerId, id]
	);
	return result.rows[0] ? parseSummary(result.rows[0]) : null;
};

export const restoreConversation = async (ownerId, id) => {
	const result = await pool.query(
		`UPDATE conversations SET deleted_at = NULL, updated_at = $1
		 WHERE owner_id = $2 AND id = $3 AND deleted_at IS NOT NULL`,
		[Date.now(), ownerId, id]
	);
	return result.rowCount ? getConversation(ownerId, id) : null;
};

export const purgeConversation = async (ownerId, id) => {
	const result = await pool.query(
		'DELETE FROM conversations WHERE owner_id = $1 AND id = $2',
		[ownerId, id]
	);
	return result.rowCount > 0;
};

export const importConversation = async (ownerId, conversation) => {
	const existing = await getConversationRow(ownerId, conversation.id, true);
	if (existing?.deleted_at != null) {
		await pool.query(
			'UPDATE conversations SET deleted_at = NULL WHERE owner_id = $1 AND id = $2',
			[ownerId, conversation.id]
		);
	}
	const saved = await saveConversation(ownerId, conversation);
	const deletedAt = Number(conversation.deletedAt);
	await pool.query(
		`UPDATE conversations SET created_at = $1, updated_at = $2, deleted_at = $3
		 WHERE owner_id = $4 AND id = $5`,
		[
			Number(conversation.createdAt) || saved.createdAt,
			Number(conversation.updatedAt) || saved.updatedAt,
			Number.isSafeInteger(deletedAt) && deletedAt > 0 ? deletedAt : null,
			ownerId,
			conversation.id
		]
	);
	return { id: conversation.id, messageCount: saved.messageCount };
};

export const closeHistoryDatabase = async () => pool.end();
export const historyBackend = 'postgresql';
