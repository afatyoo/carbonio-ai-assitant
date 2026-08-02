import http from 'node:http';
import { randomUUID } from 'node:crypto';

import { runAgent } from './agent.js';
import { getPublicAgentConfig, updateAgentConfig } from './config.js';
import {
	deleteConversation,
	getConversation,
	listConversationPage,
	renameConversation,
	restoreConversation,
	saveConversation
} from './history.js';
import { getKnowledgeMetadata, retrieveKnowledge } from './knowledge.js';
import { getCurrentAccount } from './mailbox.js';
import { logEvent } from './logger.js';
import { listAvailableModels } from './models.js';
import { runWithRequestContext } from './request-context.js';

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

const handleRequest = async (request, response) => {
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

	if (requestUrl.pathname === '/api/ai/knowledge/search' && request.method === 'GET') {
		try {
			await authenticate(request);
			const query = (requestUrl.searchParams.get('q') ?? '').trim();
			if (!query) {
				sendJson(response, 400, { error: 'q is required' });
				return;
			}
			sendJson(response, 200, {
				knowledge: getKnowledgeMetadata(),
				query,
				results: retrieveKnowledge(query)
			});
		} catch (error) {
			sendJson(response, 401, { error: error.message });
		}
		return;
	}

	if (requestUrl.pathname === '/api/ai/conversations' && request.method === 'GET') {
		try {
			const account = await getCurrentAccount(request.headers.cookie ?? '');
			const page = listConversationPage(account.id, {
				cursor: requestUrl.searchParams.get('cursor') ?? '',
				limit: requestUrl.searchParams.get('limit') ?? 20,
				query: requestUrl.searchParams.get('q') ?? ''
			});
			sendJson(response, 200, page);
		} catch (error) {
			sendJson(response, error.message.includes('cursor') ? 400 : 401, {
				error: error.message
			});
		}
		return;
	}

	const restoreMatch = requestUrl.pathname.match(
		/^\/api\/ai\/conversations\/([A-Za-z0-9_-]{1,100})\/restore$/
	);
	if (restoreMatch && request.method === 'POST') {
		try {
			const account = await getCurrentAccount(request.headers.cookie ?? '');
			const conversation = restoreConversation(account.id, restoreMatch[1]);
			sendJson(
				response,
				conversation ? 200 : 404,
				conversation ?? { error: 'Deleted conversation not found' }
			);
		} catch (error) {
			sendJson(response, 400, { error: error.message });
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
			if (request.method === 'PATCH') {
				const payload = await readJson(request);
				const conversation = renameConversation(account.id, id, payload.title);
				sendJson(
					response,
					conversation ? 200 : 404,
					conversation ?? { error: 'Conversation not found' }
				);
				return;
			}
			if (request.method === 'DELETE') {
				const conversation = deleteConversation(account.id, id);
				sendJson(
					response,
					conversation ? 200 : 404,
					conversation ?? { error: 'Conversation not found' }
				);
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

		const wantsEventStream = request.headers.accept
			?.toLowerCase()
			.includes('text/event-stream');
		const events = [];
		if (wantsEventStream) {
			response.writeHead(200, {
				'content-type': 'text/event-stream; charset=utf-8',
				'cache-control': 'no-cache, no-transform',
				connection: 'keep-alive',
				'x-accel-buffering': 'no'
			});
		}
		const emit = (event, data) => {
			if (wantsEventStream) {
				response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
				return;
			}
			events.push({ event, data });
		};

		await runAgent({
			message: payload.message.trim(),
			model: typeof payload.model === 'string' ? payload.model.trim() : '',
			cookie: request.headers.cookie ?? '',
			emit
		});
		if (wantsEventStream) {
			response.end();
		} else {
			sendJson(response, 200, { events });
		}
	} catch (error) {
		if (!response.headersSent) {
			sendJson(
				response,
				error.message.includes('authentication') ? 401 : 500,
				{ error: error.message }
			);
			return;
		}
		response.write(`event: error\ndata: ${JSON.stringify({ message: error.message })}\n\n`);
		response.end();
	}
};

const server = http.createServer((request, response) => {
	const incomingRequestId = request.headers['x-request-id'];
	const requestId =
		typeof incomingRequestId === 'string' && /^[A-Za-z0-9._-]{8,100}$/.test(incomingRequestId)
			? incomingRequestId
			: randomUUID();
	response.setHeader('x-request-id', requestId);
	const startedAt = Date.now();
	void runWithRequestContext({ requestId }, async () => {
		response.once('finish', () => {
			logEvent('info', 'http_request', {
				method: request.method,
				path: new URL(request.url, 'http://127.0.0.1').pathname,
				status: response.statusCode,
				duration_ms: Date.now() - startedAt
			});
		});
		try {
			await handleRequest(request, response);
		} catch (error) {
			logEvent('error', 'unhandled_request_error', { error });
			if (!response.headersSent) {
				sendJson(response, 500, { error: 'Internal gateway error' });
			} else if (!response.writableEnded) {
				response.end();
			}
		}
	});
});

server.listen(port, '127.0.0.1', () => {
	logEvent('info', 'gateway_started', {
		address: `127.0.0.1:${port}`,
		mode: getPublicAgentConfig().mode
	});
});
