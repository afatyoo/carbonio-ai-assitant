import http from 'node:http';
import assert from 'node:assert/strict';

import { fetchWithRetry } from '../src/fetch-with-retry.js';
import { createProviderCircuitBreaker } from '../src/provider-circuit-breaker.js';

let retryRequests = 0;
const server = http.createServer((request, response) => {
	if (request.url === '/retry') {
		retryRequests += 1;
		response.writeHead(retryRequests < 3 ? 503 : 200, {
			'content-type': 'application/json'
		});
		response.end(JSON.stringify({ ok: retryRequests >= 3 }));
		return;
	}
	if (request.url === '/timeout') {
		setTimeout(() => {
			if (response.destroyed) return;
			response.writeHead(200, { 'content-type': 'application/json' });
			response.end(JSON.stringify({ ok: true }));
		}, 100);
		return;
	}
	response.writeHead(404);
	response.end();
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;

try {
	const response = await fetchWithRetry(`${baseUrl}/retry`, {}, { timeoutMs: 2_000 });
	if (!response.ok || retryRequests !== 3) {
		throw new Error(`Retry policy failed after ${retryRequests} request(s)`);
	}

	let timeoutRejected = false;
	try {
		await fetchWithRetry(`${baseUrl}/timeout`, {}, { timeoutMs: 20, maxAttempts: 1 });
	} catch (error) {
		if (!error.message.includes('timed out')) throw error;
		timeoutRejected = true;
	}
	if (!timeoutRejected) throw new Error('Timeout policy did not abort the request');

	const controller = new AbortController();
	setTimeout(() => controller.abort(), 10);
	await assert.rejects(
		() =>
			fetchWithRetry(
				`${baseUrl}/timeout`,
				{ signal: controller.signal },
				{ timeoutMs: 1_000, maxAttempts: 1 }
			),
		(error) => error.name === 'AbortError' && error.message.includes('cancelled')
	);

	let now = 0;
	const breaker = createProviderCircuitBreaker({
		failureThreshold: 2,
		cooldownMs: 1_000,
		now: () => now
	});
	breaker.beforeRequest('test');
	breaker.recordFailure('test');
	breaker.beforeRequest('test');
	breaker.recordFailure('test');
	assert.throws(() => breaker.beforeRequest('test'), /temporarily open/);
	now = 1_001;
	const probe = breaker.beforeRequest('test');
	assert.equal(probe.halfOpenProbe, true);
	assert.throws(() => breaker.beforeRequest('test'), /temporarily open/);
	breaker.recordCancellation('test');
	assert.equal(breaker.snapshot()[0].state, 'open');
	now = 2_002;
	assert.equal(breaker.beforeRequest('test').halfOpenProbe, true);
	breaker.recordSuccess('test');
	assert.equal(breaker.beforeRequest('test').halfOpenProbe, false);

	console.log('provider_retry=ok provider_timeout=ok provider_cancel=ok provider_circuit=ok');
} finally {
	server.closeAllConnections();
	await new Promise((resolve) => server.close(resolve));
}
