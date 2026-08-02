import assert from 'node:assert/strict';

import pg from 'pg';

const resilienceModule = await import('../src/postgres-pool-resilience.js').catch(() => ({}));

assert.equal(
	typeof resilienceModule.attachPostgresPoolErrorHandler,
	'function',
	'PostgreSQL pool errors must be handled without terminating the gateway'
);

const { Pool } = pg;
const pool = new Pool();
const records = [];

resilienceModule.attachPostgresPoolErrorHandler(pool, {
	log: (level, event, fields) => records.push({ level, event, fields })
});
const postgresRestartError = Object.assign(
	new Error(
		'terminating connection for postgresql://carbonio_ai:supersecret@127.0.0.1/carbonio_ai'
	),
	{ code: '57P01' }
);

assert.doesNotThrow(() => pool.emit('error', postgresRestartError));
assert.deepEqual(records, [
	{
		level: 'error',
		event: 'postgres_pool_error',
		fields: { error_name: 'Error', code: '57P01' }
	}
]);
assert.equal(JSON.stringify(records).includes('supersecret'), false);

pool.removeAllListeners('error');
await pool.end();

console.log('postgres_restart_survival=ok postgres_pool_error_logging=ok');
