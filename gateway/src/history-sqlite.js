import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const historyBackend = 'sqlite';

const runtimeDirectory = path.resolve('.runtime');
fs.mkdirSync(runtimeDirectory, { recursive: true, mode: 0o700 });
const databasePath = path.join(runtimeDirectory, 'history.sqlite');
const database = new DatabaseSync(databasePath);

database.exec(`
	PRAGMA journal_mode = WAL;
	PRAGMA foreign_keys = ON;
	CREATE TABLE IF NOT EXISTS conversations (
		owner_id TEXT NOT NULL,
		id TEXT NOT NULL,
		title TEXT NOT NULL,
		model TEXT NOT NULL,
		messages_json TEXT NOT NULL,
		message_count INTEGER NOT NULL DEFAULT 0,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL,
		deleted_at INTEGER,
		PRIMARY KEY (owner_id, id)
	);
	CREATE INDEX IF NOT EXISTS conversations_owner_updated
	ON conversations(owner_id, updated_at DESC);
	CREATE TABLE IF NOT EXISTS daily_ai_usage (
		owner_id TEXT NOT NULL,
		usage_date TEXT NOT NULL,
		request_count INTEGER NOT NULL DEFAULT 0,
		updated_at INTEGER NOT NULL,
		PRIMARY KEY (owner_id, usage_date)
	);
`);

const columns = new Set(
	database.prepare('PRAGMA table_info(conversations)').all().map(({ name }) => name)
);
if (!columns.has('deleted_at')) {
	database.exec('ALTER TABLE conversations ADD COLUMN deleted_at INTEGER');
}
if (!columns.has('message_count')) {
	database.exec(
		'ALTER TABLE conversations ADD COLUMN message_count INTEGER NOT NULL DEFAULT 0'
	);
}

const rowsWithoutMessageCount = database
	.prepare(
		`SELECT owner_id, id, messages_json FROM conversations
		 WHERE message_count = 0 AND messages_json <> '[]'`
	)
	.all();
if (rowsWithoutMessageCount.length > 0) {
	const updateMessageCount = database.prepare(
		'UPDATE conversations SET message_count = ? WHERE owner_id = ? AND id = ?'
	);
	database.exec('BEGIN');
	try {
		for (const row of rowsWithoutMessageCount) {
			let messageCount = 0;
			try {
				const messages = JSON.parse(row.messages_json);
				messageCount = Array.isArray(messages) ? messages.length : 0;
			} catch {
				messageCount = 0;
			}
			updateMessageCount.run(messageCount, row.owner_id, row.id);
		}
		database.exec('COMMIT');
	} catch (error) {
		database.exec('ROLLBACK');
		throw error;
	}
}
database.exec(`
	CREATE INDEX IF NOT EXISTS conversations_owner_deleted_updated
	ON conversations(owner_id, deleted_at, updated_at DESC, id DESC);
`);

fs.chmodSync(databasePath, 0o600);

export const consumeDailyRequest = (ownerId, usageDate, limit) => {
	const existing = database
		.prepare('SELECT request_count FROM daily_ai_usage WHERE owner_id = ? AND usage_date = ?')
		.get(ownerId, usageDate);
	if (Number(existing?.request_count ?? 0) >= limit) return null;
	database
		.prepare(
			`INSERT INTO daily_ai_usage(owner_id, usage_date, request_count, updated_at)
			 VALUES (?, ?, 1, ?)
			 ON CONFLICT(owner_id, usage_date) DO UPDATE SET
			 request_count = request_count + 1, updated_at = excluded.updated_at`
		)
		.run(ownerId, usageDate, Date.now());
	database.prepare('DELETE FROM daily_ai_usage WHERE updated_at < ?').run(Date.now() - 90 * 86_400_000);
	return Number(existing?.request_count ?? 0) + 1;
};

export const purgeDailyUsage = (ownerId) => {
	database.prepare('DELETE FROM daily_ai_usage WHERE owner_id = ?').run(ownerId);
};

const parseConversation = (row) => ({
	id: row.id,
	title: row.title,
	model: row.model,
	messages: JSON.parse(row.messages_json),
	messageCount: row.message_count,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
	deletedAt: row.deleted_at
});

const parseConversationSummary = (row) => ({
	id: row.id,
	title: row.title,
	model: row.model,
	messageCount: row.message_count,
	createdAt: row.created_at,
	updatedAt: row.updated_at,
	deletedAt: row.deleted_at
});

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

const getConversationRecord = (ownerId, id, includeDeleted = false) => {
	const row = database
		.prepare(
			`SELECT id, title, model, messages_json, message_count,
			        created_at, updated_at, deleted_at
			 FROM conversations
			 WHERE owner_id = ? AND id = ?
			 ${includeDeleted ? '' : 'AND deleted_at IS NULL'}`
		)
		.get(ownerId, id);
	return row ? parseConversation(row) : null;
};

export const listConversationPage = (
	ownerId,
	{ cursor = '', limit = 20, query = '' } = {}
) => {
	const pageSize = normalizeLimit(limit);
	const decodedCursor = decodeCursor(cursor);
	const normalizedQuery = String(query ?? '').trim().slice(0, 100);
	const conditions = ['owner_id = ?', 'deleted_at IS NULL'];
	const parameters = [ownerId];
	if (normalizedQuery) {
		const escapedQuery = normalizedQuery.replace(/[\\%_]/g, '\\$&');
		conditions.push("title LIKE ? ESCAPE '\\' COLLATE NOCASE");
		parameters.push(`%${escapedQuery}%`);
	}
	if (decodedCursor) {
		conditions.push('(updated_at < ? OR (updated_at = ? AND id < ?))');
		parameters.push(decodedCursor.updatedAt, decodedCursor.updatedAt, decodedCursor.id);
	}
	const statement = database.prepare(
		`SELECT id, title, model, message_count, created_at, updated_at, deleted_at
		 FROM conversations
		 WHERE ${conditions.join(' AND ')}
		 ORDER BY updated_at DESC, id DESC LIMIT ?`
	);
	const rows = statement.all(...parameters, pageSize + 1);
	const hasMore = rows.length > pageSize;
	const conversations = rows.slice(0, pageSize).map(parseConversationSummary);
	const last = conversations.at(-1);
	return {
		conversations,
		nextCursor: hasMore && last ? encodeCursor(last) : null
	};
};

export const listConversations = (ownerId) =>
	listConversationPage(ownerId, { limit: 50 }).conversations;

export const getConversation = (ownerId, id) =>
	getConversationRecord(ownerId, id, false);

export const saveConversation = (ownerId, conversation) => {
	const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
	if (messages.length > 500) throw new Error('Conversation exceeds 500 messages');
	for (const message of messages) {
		if (
			!['assistant', 'user'].includes(message.role) ||
			typeof message.text !== 'string' ||
			message.text.length > 100_000
		) {
			throw new Error('Invalid conversation message');
		}
	}
	const now = Date.now();
	const existing = getConversationRecord(ownerId, conversation.id, true);
	if (existing?.deletedAt) throw new Error('Conversation is deleted');
	const record = {
		id: conversation.id,
		title: String(conversation.title || 'New conversation').slice(0, 120),
		model: String(conversation.model || '').slice(0, 200),
		messages,
		messageCount: messages.length,
		createdAt: existing?.createdAt ?? now,
		updatedAt: now,
		deletedAt: null
	};
	database
		.prepare(
			`INSERT INTO conversations
			 (owner_id, id, title, model, messages_json, message_count,
			  created_at, updated_at, deleted_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
			 ON CONFLICT(owner_id, id) DO UPDATE SET
			 title = excluded.title,
			 model = excluded.model,
			 messages_json = excluded.messages_json,
			 message_count = excluded.message_count,
			 updated_at = excluded.updated_at`
		)
		.run(
			ownerId,
			record.id,
			record.title,
			record.model,
			JSON.stringify(record.messages),
			record.messageCount,
			record.createdAt,
			record.updatedAt
		);
	return record;
};

export const renameConversation = (ownerId, id, title) => {
	const normalizedTitle = typeof title === 'string' ? title.trim().slice(0, 120) : '';
	if (!normalizedTitle) throw new Error('Conversation title is required');
	const result = database
		.prepare(
			`UPDATE conversations SET title = ?, updated_at = ?
			 WHERE owner_id = ? AND id = ? AND deleted_at IS NULL`
		)
		.run(normalizedTitle, Date.now(), ownerId, id);
	return result.changes > 0 ? getConversation(ownerId, id) : null;
};

export const deleteConversation = (ownerId, id) => {
	const now = Date.now();
	const result = database
		.prepare(
			`UPDATE conversations SET deleted_at = ?, updated_at = ?
			 WHERE owner_id = ? AND id = ? AND deleted_at IS NULL`
		)
		.run(now, now, ownerId, id);
	return result.changes > 0 ? getConversationRecord(ownerId, id, true) : null;
};

export const restoreConversation = (ownerId, id) => {
	const result = database
		.prepare(
			`UPDATE conversations SET deleted_at = NULL, updated_at = ?
			 WHERE owner_id = ? AND id = ? AND deleted_at IS NOT NULL`
		)
		.run(Date.now(), ownerId, id);
	return result.changes > 0 ? getConversation(ownerId, id) : null;
};

export const purgeConversation = (ownerId, id) => {
	const result = database
		.prepare('DELETE FROM conversations WHERE owner_id = ? AND id = ?')
		.run(ownerId, id);
	return result.changes > 0;
};
