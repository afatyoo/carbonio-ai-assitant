import http from 'node:http';

import { fetchWithRetry } from '../src/fetch-with-retry.js';

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

	console.log('provider_retry=ok provider_timeout=ok');
} finally {
	server.closeAllConnections();
	await new Promise((resolve) => server.close(resolve));
}
