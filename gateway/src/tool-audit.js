import { createHash, randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { getRequestContext } from './request-context.js';

const defaultRuntimeDirectory = path.resolve('.runtime');
const databasePath = process.env.AI_AUDIT_DB_PATH
	? path.resolve(process.env.AI_AUDIT_DB_PATH)
	: path.join(defaultRuntimeDirectory, 'audit.sqlite');
fs.mkdirSync(path.dirname(databasePath), { recursive: true, mode: 0o700 });
const database = new DatabaseSync(databasePath);

database.exec(`
	PRAGMA journal_mode = WAL;
	CREATE TABLE IF NOT EXISTS tool_audit (
		id TEXT PRIMARY KEY,
		owner_id TEXT NOT NULL,
		request_id TEXT,
		tool_name TEXT NOT NULL,
		risk TEXT NOT NULL,
		input_hash TEXT NOT NULL,
		input_summary_json TEXT NOT NULL,
		status TEXT NOT NULL,
		result_count INTEGER,
		error_code TEXT,
		created_at INTEGER NOT NULL,
		completed_at INTEGER
	);
	CREATE INDEX IF NOT EXISTS tool_audit_owner_created
	ON tool_audit(owner_id, created_at DESC, id DESC);
	CREATE TABLE IF NOT EXISTS tool_confirmations (
		token_hash TEXT PRIMARY KEY,
		owner_id TEXT NOT NULL,
		tool_name TEXT NOT NULL,
		input_hash TEXT NOT NULL,
		expires_at INTEGER NOT NULL,
		consumed_at INTEGER
	);
	CREATE TABLE IF NOT EXISTS tool_idempotency (
		owner_id TEXT NOT NULL,
		tool_name TEXT NOT NULL,
		idempotency_key TEXT NOT NULL,
		input_hash TEXT NOT NULL,
		result_json TEXT NOT NULL,
		created_at INTEGER NOT NULL,
		PRIMARY KEY (owner_id, tool_name, idempotency_key)
	);
`);
if (!database.prepare('PRAGMA table_info(tool_audit)').all().some(({ name }) => name === 'result_ref')) {
	database.exec('ALTER TABLE tool_audit ADD COLUMN result_ref TEXT');
}
fs.chmodSync(databasePath, 0o600);

export const hashToolInput = (input) =>
	createHash('sha256').update(JSON.stringify(input)).digest('hex');

const summarizeValue = (value) => {
	if (typeof value === 'string') return { type: 'string', length: value.length };
	if (Array.isArray(value)) return { type: 'array', length: value.length };
	if (value && typeof value === 'object') return { type: 'object', keys: Object.keys(value) };
	return { type: typeof value, value };
};

export const createAuditEntry = ({ ownerId, toolName, risk, input }) => {
	const id = randomUUID();
	const { requestId } = getRequestContext();
	const inputHash = hashToolInput(input);
	const summary = Object.fromEntries(
		Object.entries(input).map(([key, value]) => [key, summarizeValue(value)])
	);
	database
		.prepare(
			`INSERT INTO tool_audit
			 (id, owner_id, request_id, tool_name, risk, input_hash,
			  input_summary_json, status, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, 'running', ?)`
		)
		.run(
			id,
			ownerId,
			requestId ?? null,
			toolName,
			risk,
			inputHash,
			JSON.stringify(summary),
			Date.now()
		);
	return { id, inputHash };
};

export const completeAuditEntry = (
	id,
	{ status, resultCount = null, resultReference = null, errorCode = null }
) => {
	database
		.prepare(
			`UPDATE tool_audit
			 SET status = ?, result_count = ?, result_ref = ?, error_code = ?, completed_at = ?
			 WHERE id = ?`
		)
		.run(status, resultCount, resultReference, errorCode, Date.now(), id);
};

export const createConfirmation = ({ ownerId, toolName, inputHash, ttlMs = 300_000 }) => {
	const token = randomBytes(32).toString('base64url');
	const tokenHash = createHash('sha256').update(token).digest('hex');
	const expiresAt = Date.now() + Math.min(Math.max(ttlMs, 30_000), 600_000);
	database
		.prepare(
			`INSERT INTO tool_confirmations
			 (token_hash, owner_id, tool_name, input_hash, expires_at, consumed_at)
			 VALUES (?, ?, ?, ?, ?, NULL)`
		)
		.run(tokenHash, ownerId, toolName, inputHash, expiresAt);
	return { token, expiresAt };
};

export const consumeConfirmation = ({ token, ownerId, toolName, inputHash }) => {
	if (typeof token !== 'string' || token.length < 32) return false;
	const tokenHash = createHash('sha256').update(token).digest('hex');
	const result = database
		.prepare(
			`UPDATE tool_confirmations SET consumed_at = ?
			 WHERE token_hash = ? AND owner_id = ? AND tool_name = ? AND input_hash = ?
			   AND consumed_at IS NULL AND expires_at >= ?`
		)
		.run(Date.now(), tokenHash, ownerId, toolName, inputHash, Date.now());
	return result.changes === 1;
};

export const getIdempotentResult = ({ ownerId, toolName, idempotencyKey, inputHash }) => {
	if (!idempotencyKey) return null;
	const row = database
		.prepare(
			`SELECT input_hash, result_json FROM tool_idempotency
			 WHERE owner_id = ? AND tool_name = ? AND idempotency_key = ?`
		)
		.get(ownerId, toolName, idempotencyKey);
	if (!row) return null;
	if (row.input_hash !== inputHash) throw new Error('Idempotency key input mismatch');
	return JSON.parse(row.result_json);
};

export const saveIdempotentResult = ({
	ownerId,
	toolName,
	idempotencyKey,
	inputHash,
	result
}) => {
	if (!idempotencyKey) return;
	database
		.prepare(
			`INSERT OR IGNORE INTO tool_idempotency
			 (owner_id, tool_name, idempotency_key, input_hash, result_json, created_at)
			 VALUES (?, ?, ?, ?, ?, ?)`
		)
		.run(ownerId, toolName, idempotencyKey, inputHash, JSON.stringify(result), Date.now());
};

export const listAuditEntries = (ownerId, limit = 50) =>
	database
		.prepare(
			`SELECT id, request_id, tool_name, risk, status, result_count, result_ref,
			        error_code, created_at, completed_at
			 FROM tool_audit WHERE owner_id = ?
			 ORDER BY created_at DESC, id DESC LIMIT ?`
		)
		.all(ownerId, Math.min(Math.max(Number(limit) || 50, 1), 100))
		.map((row) => ({
			id: row.id,
			requestId: row.request_id,
			tool: row.tool_name,
			risk: row.risk,
			status: row.status,
			resultCount: row.result_count,
			resultReference: row.result_ref,
			errorCode: row.error_code,
			createdAt: row.created_at,
			completedAt: row.completed_at
		}));

export const listAllAuditEntries = (limit = 100) =>
	database
		.prepare(
			`SELECT id, owner_id, request_id, tool_name, risk, status, result_count,
			        result_ref, error_code, created_at, completed_at
			 FROM tool_audit ORDER BY created_at DESC, id DESC LIMIT ?`
		)
		.all(Math.min(Math.max(Number(limit) || 100, 1), 500))
		.map((row) => ({
			id: row.id,
			ownerId: row.owner_id,
			requestId: row.request_id,
			tool: row.tool_name,
			risk: row.risk,
			status: row.status,
			resultCount: row.result_count,
			resultReference: row.result_ref,
			errorCode: row.error_code,
			createdAt: row.created_at,
			completedAt: row.completed_at
		}));
