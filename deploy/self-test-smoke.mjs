import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';

function run(command, args, options) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, options);
		let stdout = '';
		let stderr = '';

		child.stdout.on('data', (chunk) => {
			stdout += chunk;
		});
		child.stderr.on('data', (chunk) => {
			stderr += chunk;
		});
		child.on('error', reject);
		child.on('close', (status) => {
			resolve({ status, stdout, stderr });
		});
	});
}

function close(server) {
	return new Promise((resolve, reject) => {
		server.close((error) => (error ? reject(error) : resolve()));
	});
}

async function runSmoke(health) {
	const server = http.createServer((request, response) => {
		response.setHeader('X-Content-Type-Options', 'nosniff');
		response.setHeader('X-Frame-Options', 'SAMEORIGIN');
		response.setHeader('Cache-Control', 'no-store');

		if (request.url === '/api/ai/health') {
			response.writeHead(200, { 'Content-Type': 'application/json' });
			response.end(JSON.stringify(health));
			return;
		}

		if (request.url === '/api/ai/admin/metrics') {
			response.writeHead(401);
			response.end();
			return;
		}

		if (request.url === '/api/ai/chat') {
			response.writeHead(403);
			response.end();
			return;
		}

		response.writeHead(404);
		response.end();
	});

	await new Promise((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', resolve);
	});

	try {
		const { port } = server.address();
		return await run('bash', ['deploy/smoke-test.sh'], {
			cwd: process.cwd(),
			env: {
				...process.env,
				CARBONIO_AI_BASE_URL: `http://127.0.0.1:${port}`,
			},
		});
	} finally {
		await close(server);
	}
}

const sqlite = await runSmoke({ status: 'ok', enabled: true, historyBackend: 'sqlite' });
assert.notEqual(sqlite.status, 0, 'production smoke must reject SQLite history');

const postgres = await runSmoke({ status: 'ok', enabled: true, historyBackend: 'postgresql' });
assert.equal(postgres.status, 0, postgres.stderr);
assert.match(postgres.stdout, /history=postgresql/, 'success output must identify PostgreSQL history');

console.log('smoke_sqlite_rejected=ok smoke_postgresql=ok');
