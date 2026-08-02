import assert from 'node:assert/strict';

import pg from 'pg';

import { attachPostgresPoolErrorHandler } from '../src/postgres-pool-resilience.js';

const connectionString = process.env.AI_TEST_DATABASE_URL;
if (!connectionString) throw new Error('AI_TEST_DATABASE_URL is required');

const { Pool } = pg;
const historyPool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5_000 });
const controlPool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5_000 });
const records = [];
let resolvePoolError;
const poolErrorObserved = new Promise((resolve) => {
	resolvePoolError = resolve;
});

attachPostgresPoolErrorHandler(historyPool, {
	log: (level, event, fields) => {
		records.push({ level, event, fields });
		resolvePoolError();
	}
});

try {
	const initial = await historyPool.query('SELECT pg_backend_pid() AS pid');
	const initialPid = Number(initial.rows[0].pid);
	const terminated = await controlPool.query('SELECT pg_terminate_backend($1) AS terminated', [
		initialPid
	]);
	assert.equal(terminated.rows[0].terminated, true);

	let poolErrorTimeout;
	try {
		await Promise.race([
			poolErrorObserved,
			new Promise((_, reject) => {
				poolErrorTimeout = setTimeout(
					() => reject(new Error('PostgreSQL pool error was not observed')),
					5_000
				);
			})
		]);
	} finally {
		clearTimeout(poolErrorTimeout);
	}
	assert.equal(records.length, 1);
	assert.equal(records[0].event, 'postgres_pool_error');
	assert.equal(records[0].fields.code, '57P01');

	const reconnected = await historyPool.query('SELECT pg_backend_pid() AS pid, 1 AS ok');
	assert.equal(Number(reconnected.rows[0].ok), 1);
	assert.notEqual(Number(reconnected.rows[0].pid), initialPid);

	console.log('postgres_idle_disconnect=ok gateway_process_alive=ok postgres_reconnect=ok');
} finally {
	await Promise.allSettled([historyPool.end(), controlPool.end()]);
}
