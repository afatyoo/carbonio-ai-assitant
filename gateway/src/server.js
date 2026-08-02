import http from 'node:http';
import { randomUUID } from 'node:crypto';

import { runAgent } from './agent.js';
import { getPublicAgentConfig, updateAgentConfig } from './config.js';
import {
	deleteConversation,
	closeHistoryDatabase,
	getConversation,
	historyBackend,
	listConversationPage,
	renameConversation,
	restoreConversation,
	saveConversation
} from './history.js';
import { getKnowledgeMetadata, retrieveKnowledge } from './knowledge.js';
import { getCurrentAccount } from './mailbox.js';
import { logEvent } from './logger.js';
import { getMetricsSnapshot, incrementMetric } from './metrics.js';
import { listAvailableModels } from './models.js';
import { runWithRequestContext } from './request-context.js';
import { listAuditEntries } from './tool-audit.js';
import { listToolDefinitions } from './tool-registry.js';
import { executeTool } from './tool-runner.js';
import {
	areWriteToolsEnabled,
	assertSameOrigin,
	consumeAccountQuota,
	getSecurityPolicy,
	isAdminAccount,
	isAiEnabled,
	requireAdminAccount
} from './security.js';

const port = Number(process.env.PORT ?? 8787);

const sendJson = (response, status, body) => {
	response.setHeader('cache-control', 'no-store');
	response.setHeader('content-security-policy', "default-src 'none'; frame-ancestors 'self'");
	response.setHeader('referrer-policy', 'no-referrer');
	response.setHeader('x-content-type-options', 'nosniff');
	response.setHeader('x-frame-options', 'SAMEORIGIN');
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

const errorStatus = (error, fallback = 400) =>
	Number(error?.statusCode) ||
	(error.message.includes('authentication')
		? 401
		: error.message.includes('permission')
			? 403
			: fallback);

const handleRequest = async (request, response) => {
	const requestUrl = new URL(request.url, 'http://127.0.0.1');

	if (request.method === 'GET' && request.url === '/api/ai/health') {
		sendJson(response, 200, {
			status: 'ok',
			mode: getPublicAgentConfig().mode,
			historyBackend,
			enabled: isAiEnabled()
		});
		return;
	}

	if (!isAiEnabled()) {
		sendJson(response, 503, { error: 'AI Assistant is disabled by administrator policy' });
		return;
	}

	if (request.method === 'GET' && request.url === '/api/ai/config') {
		try {
			const account = await authenticate(request);
			sendJson(response, 200, {
				...getPublicAgentConfig(),
				canManageSettings: isAdminAccount(account)
			});
		} catch (error) {
			sendJson(response, 401, { error: error.message });
		}
		return;
	}

	if (request.method === 'GET' && request.url === '/api/ai/admin/metrics') {
		try {
			const account = await authenticate(request);
			requireAdminAccount(account);
			sendJson(response, 200, { metrics: getMetricsSnapshot(), policy: getSecurityPolicy() });
		} catch (error) {
			sendJson(response, errorStatus(error, 403), { error: error.message });
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

	if (requestUrl.pathname === '/api/ai/tools' && request.method === 'GET') {
		try {
			await authenticate(request);
			sendJson(response, 200, {
				tools: listToolDefinitions().map(
					({ preview, validate, resultReference, ...definition }) => definition
				)
			});
		} catch (error) {
			sendJson(response, 401, { error: error.message });
		}
		return;
	}

	if (requestUrl.pathname === '/api/ai/audit' && request.method === 'GET') {
		try {
			const account = await authenticate(request);
			sendJson(response, 200, {
				entries: listAuditEntries(account.id, requestUrl.searchParams.get('limit') ?? 50)
			});
		} catch (error) {
			sendJson(response, 401, { error: error.message });
		}
		return;
	}

	const toolExecuteMatch = requestUrl.pathname.match(
		/^\/api\/ai\/tools\/([a-z][a-z0-9_]{2,63})\/execute$/
	);
	if (toolExecuteMatch && request.method === 'POST') {
		try {
			const account = await authenticate(request);
			await consumeAccountQuota(account.id);
			const payload = await readJson(request);
			const permissions = ['mail.read', 'calendar.read'];
			if (areWriteToolsEnabled()) permissions.push('mail.draft', 'calendar.write');
			const execution = await executeTool({
				name: toolExecuteMatch[1],
				input: payload.input,
				context: {
					ownerId: account.id,
					accountName: account.name,
					cookie: request.headers.cookie ?? '',
					permissions,
					confirmationToken: payload.confirmationToken,
					idempotencyKey: payload.idempotencyKey
				}
			});
			sendJson(response, 200, execution);
		} catch (error) {
			const status = error.statusCode ?? (error.message.includes('authentication')
				? 401
				: error.message.includes('Unknown tool')
					? 404
					: 400);
			sendJson(response, status, { error: error.message });
		}
		return;
	}

	if (requestUrl.pathname === '/api/ai/conversations' && request.method === 'GET') {
		try {
			const account = await getCurrentAccount(request.headers.cookie ?? '');
			const page = await listConversationPage(account.id, {
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
			const conversation = await restoreConversation(account.id, restoreMatch[1]);
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
				const conversation = await getConversation(account.id, id);
				sendJson(
					response,
					conversation ? 200 : 404,
					conversation ?? { error: 'Conversation not found' }
				);
				return;
			}
			if (request.method === 'PUT') {
				const payload = await readJson(request);
				sendJson(response, 200, await saveConversation(account.id, { ...payload, id }));
				return;
			}
			if (request.method === 'PATCH') {
				const payload = await readJson(request);
				const conversation = await renameConversation(account.id, id, payload.title);
				sendJson(
					response,
					conversation ? 200 : 404,
					conversation ?? { error: 'Conversation not found' }
				);
				return;
			}
			if (request.method === 'DELETE') {
				const conversation = await deleteConversation(account.id, id);
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
			const account = await authenticate(request);
			requireAdminAccount(account);
			const payload = await readJson(request);
			sendJson(response, 200, {
				...updateAgentConfig(payload),
				canManageSettings: true
			});
		} catch (error) {
			sendJson(response, errorStatus(error), { error: error.message });
		}
		return;
	}

	if (request.method !== 'POST' || request.url !== '/api/ai/chat') {
		sendJson(response, 404, { error: 'Not found' });
		return;
	}

	try {
		const account = await authenticate(request);
		await consumeAccountQuota(account.id);
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
			account,
			emit
		});
		incrementMetric('chat_completed_total');
		if (wantsEventStream) {
			response.end();
		} else {
			sendJson(response, 200, { events });
		}
	} catch (error) {
		incrementMetric('chat_failed_total');
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
	response.setHeader('content-security-policy', "default-src 'none'; frame-ancestors 'self'");
	response.setHeader('referrer-policy', 'no-referrer');
	response.setHeader('x-content-type-options', 'nosniff');
	response.setHeader('x-frame-options', 'SAMEORIGIN');
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
			assertSameOrigin(request);
			incrementMetric('http_requests_total');
			await handleRequest(request, response);
		} catch (error) {
			logEvent('error', 'unhandled_request_error', { error });
			if (!response.headersSent) {
				sendJson(response, errorStatus(error, 500), {
					error: errorStatus(error, 500) >= 500 ? 'Internal gateway error' : error.message
				});
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

const shutdown = (signal) => {
	logEvent('info', 'gateway_stopping', { signal });
	server.close(() => {
		void closeHistoryDatabase().finally(() => process.exit(0));
	});
	setTimeout(() => process.exit(1), 10_000).unref();
};

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
