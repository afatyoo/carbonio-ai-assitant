import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

if (!process.env.AI_DATABASE_URL) throw new Error('AI_DATABASE_URL is required');
if (!process.env.AI_HISTORY_ENCRYPTION_KEY) {
	throw new Error('AI_HISTORY_ENCRYPTION_KEY is required');
}

const sqlitePath = path.resolve(process.argv[2] ?? '.runtime/history.sqlite');
if (!fs.existsSync(sqlitePath)) throw new Error(`SQLite history not found: ${sqlitePath}`);

const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });
const rows = sqlite
	.prepare(
		`SELECT owner_id, id, title, model, messages_json, created_at, updated_at
		 FROM conversations WHERE deleted_at IS NULL ORDER BY created_at, id`
	)
	.all();

const { closeHistoryDatabase, getConversation, saveConversation } = await import('../src/history.js');
let migrated = 0;
for (const row of rows) {
	let messages;
	try {
		messages = JSON.parse(row.messages_json);
	} catch {
		throw new Error(`Conversation ${row.id} contains invalid message JSON`);
	}
	await saveConversation(row.owner_id, {
		id: row.id,
		title: row.title,
		model: row.model,
		messages,
		createdAt: Number(row.created_at),
		updatedAt: Number(row.updated_at)
	});
	const verified = await getConversation(row.owner_id, row.id);
	if (!verified || verified.messages.length !== messages.length) {
		throw new Error(`PostgreSQL verification failed for conversation ${row.id}`);
	}
	migrated += 1;
}
sqlite.close();
await closeHistoryDatabase();
console.log(`source=${sqlitePath} active_rows=${rows.length} migrated=${migrated} verified=ok`);
