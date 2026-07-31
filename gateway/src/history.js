import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

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
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL,
		PRIMARY KEY (owner_id, id)
	);
	CREATE INDEX IF NOT EXISTS conversations_owner_updated
	ON conversations(owner_id, updated_at DESC);
`);

fs.chmodSync(databasePath, 0o600);

const parseConversation = (row) => ({
	id: row.id,
	title: row.title,
	model: row.model,
	messages: JSON.parse(row.messages_json),
	createdAt: row.created_at,
	updatedAt: row.updated_at
});

export const listConversations = (ownerId) =>
	database
		.prepare(
			`SELECT id, title, model, messages_json, created_at, updated_at
			 FROM conversations WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 50`
		)
		.all(ownerId)
		.map(parseConversation);

export const getConversation = (ownerId, id) => {
	const row = database
		.prepare(
			`SELECT id, title, model, messages_json, created_at, updated_at
			 FROM conversations WHERE owner_id = ? AND id = ?`
		)
		.get(ownerId, id);
	return row ? parseConversation(row) : null;
};

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
	const existing = getConversation(ownerId, conversation.id);
	const record = {
		id: conversation.id,
		title: String(conversation.title || 'Percakapan baru').slice(0, 120),
		model: String(conversation.model || '').slice(0, 200),
		messages,
		createdAt: existing?.createdAt ?? now,
		updatedAt: now
	};
	database
		.prepare(
			`INSERT INTO conversations
			 (owner_id, id, title, model, messages_json, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT(owner_id, id) DO UPDATE SET
			 title = excluded.title,
			 model = excluded.model,
			 messages_json = excluded.messages_json,
			 updated_at = excluded.updated_at`
		)
		.run(
			ownerId,
			record.id,
			record.title,
			record.model,
			JSON.stringify(record.messages),
			record.createdAt,
			record.updatedAt
		);
	return record;
};

export const deleteConversation = (ownerId, id) => {
	const result = database
		.prepare('DELETE FROM conversations WHERE owner_id = ? AND id = ?')
		.run(ownerId, id);
	return result.changes > 0;
};
