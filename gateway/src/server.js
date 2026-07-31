import http from 'node:http';

import { runAgent } from './agent.js';
import { getPublicAgentConfig, updateAgentConfig } from './config.js';
import {
	deleteConversation,
	getConversation,
	listConversations,
	saveConversation
} from './history.js';
import { getCurrentAccount } from './mailbox.js';
import { listAvailableModels } from './models.js';

const port = Number(process.env.PORT ?? 8787);

const sendJson = (response, status, body) => {
	response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
	response.end(JSON.stringify(body));
};

const readJson = async (request) => {
	const chunks = [];
	for await (const chunk of request) chunks.push(chunk);
	if (chunks.reduce((size, chunk) => size + chunk.length, 0) > 64_000) {
		throw new Error('Request body is too large');
	}
	return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};

const authenticate = (request) => getCurrentAccount(request.headers.cookie ?? '');

const server = http.createServer(async (request, response) => {
	const requestUrl = new URL(request.url, 'http://127.0.0.1');

	if (request.method === 'GET' && request.url === '/api/ai/health') {
		sendJson(response, 200, {
			status: 'ok',
			mode: getPublicAgentConfig().mode
		});
		return;
	}

	if (request.method === 'GET' && request.url === '/api/ai/config') {
		try {
			await authenticate(request);
			sendJson(response, 200, getPublicAgentConfig());
		} catch (error) {
			sendJson(response, 401, { error: error.message });
		}
		return;
	}

	if (request.method === 'GET' && request.url === '/api/ai/models') {
		try {
			await authenticate(request);
			sendJson(response, 200, { models: await listAvailableModels() });
		} catch (error) {
			sendJson(response, error.message.includes('authentication') ? 401 : 502, {
				error: error.message
			});
		}
		return;
	}

	if (requestUrl.pathname === '/api/ai/conversations' && request.method === 'GET') {
		try {
			const account = await getCurrentAccount(request.headers.cookie ?? '');
			sendJson(response, 200, { conversations: listConversations(account.id) });
		} catch (error) {
			sendJson(response, 401, { error: error.message });
		}
		return;
	}

	const conversationMatch = requestUrl.pathname.match(
		/^\/api\/ai\/conversations\/([A-Za-z0-9_-]{1,100})$/
	);
	if (conversationMatch) {
		try {
			const account = await getCurrentAccount(request.headers.cookie ?? '');
			const id = conversationMatch[1];
			if (request.method === 'GET') {
				const conversation = getConversation(account.id, id);
				sendJson(
					response,
					conversation ? 200 : 404,
					conversation ?? { error: 'Conversation not found' }
				);
				return;
			}
			if (request.method === 'PUT') {
				const payload = await readJson(request);
				sendJson(response, 200, saveConversation(account.id, { ...payload, id }));
				return;
			}
			if (request.method === 'DELETE') {
				sendJson(response, deleteConversation(account.id, id) ? 204 : 404, {});
				return;
			}
		} catch (error) {
			sendJson(response, 400, { error: error.message });
			return;
		}
	}

	if (request.method === 'PUT' && request.url === '/api/ai/config') {
		try {
			await authenticate(request);
			const payload = await readJson(request);
			sendJson(response, 200, updateAgentConfig(payload));
		} catch (error) {
			sendJson(
				response,
				error.message.includes('authentication') ? 401 : 400,
				{ error: error.message }
			);
		}
		return;
	}

	if (request.method !== 'POST' || request.url !== '/api/ai/chat') {
		sendJson(response, 404, { error: 'Not found' });
		return;
	}

	try {
		await authenticate(request);
		const payload = await readJson(request);
		if (typeof payload.message !== 'string' || !payload.message.trim()) {
			sendJson(response, 400, { error: 'message is required' });
			return;
		}

		response.writeHead(200, {
			'content-type': 'text/event-stream; charset=utf-8',
			'cache-control': 'no-cache, no-transform',
			connection: 'keep-alive',
			'x-accel-buffering': 'no'
		});
		const emit = (event, data) => {
			response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
		};

		await runAgent({
			message: payload.message.trim(),
			model: typeof payload.model === 'string' ? payload.model.trim() : '',
			cookie: request.headers.cookie ?? '',
			emit
		});
		response.end();
	} catch (error) {
		if (!response.headersSent) {
			sendJson(response, 500, { error: error.message });
			return;
		}
		response.write(`event: error\ndata: ${JSON.stringify({ message: error.message })}\n\n`);
		response.end();
	}
});

server.listen(port, '127.0.0.1', () => {
	console.log(
		`Carbonio AI Agent Gateway listening on http://127.0.0.1:${port} (${
			getPublicAgentConfig().mode
		})`
	);
});
