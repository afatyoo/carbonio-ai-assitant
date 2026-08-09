import http from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';

import { runAgent, testProviderConnection } from './agent.js';
import { normalizeContextReference } from './context-reference.js';
import {
	assertModelAllowed,
	getAgentConfig,
	getModelAllowlist,
	getPublicAgentConfig,
	updateAgentConfig
} from './config.js';
import {
	deleteConversation,
	closeHistoryDatabase,
	getAccountPreferences,
	getConversation,
	historyBackend,
	listConversationPage,
	purgeAllAccountPreferences,
	renameConversation,
	restoreConversation,
	saveAccountPreferences,
	saveConversation
} from './history.js';
import { getKnowledgeMetadata, retrieveKnowledge } from './knowledge.js';
import { getCurrentAccount } from './mailbox.js';
import { logEvent } from './logger.js';
import { formatPrometheusMetrics, getMetricsSnapshot, incrementMetric, observeMetric } from './metrics.js';
import { buildOperationalHealth } from './operational-health.js';
import { listAvailableModels } from './models.js';
import { getProviderCircuitSnapshot } from './provider-circuit-breaker.js';
import {
	closeRagDatabase,
	enqueueRagDocuments,
	getRagStatus,
	listRagSources,
	retrievePrivateRag,
	setRagSource
} from './rag.js';
import { collectRagDocuments, revalidateRagResults } from './rag-sources.js';
import { evaluateRagCases } from './rag-evaluation.js';
import { assertAvailableRagModule, assertRagModule } from './rag-modules.js';
import { runWithRequestContext } from './request-context.js';
import {
	claimUndoAction,
	completeClaimedUndoAction,
	getUndoAction,
	listAllAuditEntries,
	listAuditEntries,
	releaseUndoAction
} from './tool-audit.js';
import { listToolDefinitions } from './tool-registry.js';
import { executeTool } from './tool-runner.js';
import {
	assertSameOrigin,
	consumeAccountQuota,
	getAccountUsage,
	getSecurityPolicy,
	getToolPermissions,
	isAdminAccount,
	isAiEnabled,
	requireAiAccess,
	requireAdminAccount,
	getRuntimeSafetyState,
	updateRuntimeSafetyState
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

const sendText = (response, status, body, contentType = 'text/plain; charset=utf-8') => {
	response.setHeader('cache-control', 'no-store');
	response.setHeader('x-content-type-options', 'nosniff');
	response.writeHead(status, { 'content-type': contentType });
	response.end(body);
};

const metricsTokenMatches = (request) => {
	const expected = String(process.env.AI_METRICS_TOKEN ?? '');
	const supplied = String(request.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
	if (!expected || !supplied || expected.length !== supplied.length) return false;
	return timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
};

const readJson = async (request) => {
	const chunks = [];
	for await (const chunk of request) chunks.push(chunk);
	if (chunks.reduce((size, chunk) => size + chunk.length, 0) > 64_000) {
		throw new Error('Request body is too large');
	}
	return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};

const authenticate = async (request) => {
	const account = await getCurrentAccount(request.headers.cookie ?? '');
	requireAiAccess(account);
	return account;
};

const errorStatus = (error, fallback = 400) =>
	Number(error?.statusCode) ||
	(error.message.includes('authentication')
		? 401
		: error.message.includes('permission')
			? 403
			: fallback);

const handleRequest = async (request, response) => {
	const requestUrl = new URL(request.url, 'http://127.0.0.1');
	if (request.method === 'GET' && requestUrl.pathname === '/api/ai/internal/metrics') {
		if (!metricsTokenMatches(request)) {
			sendJson(response, 401, { error: 'Metrics authentication required' });
			return;
		}
		let rag;
		try {
			rag = await getRagStatus();
		} catch {
			rag = { backend: 'error', queuedJobs: 0, failedJobs: 1, workerHealthy: false };
		}
		const safety = getRuntimeSafetyState();
		const health = buildOperationalHealth({ historyBackend, rag, aiEnabled: isAiEnabled(), writeToolsEnabled: safety.writeToolsEnabled });
		sendText(response, 200, formatPrometheusMetrics({ extraGauges: {
			health_ok: health.status === 'healthy' ? 1 : 0,
			rag_queue_jobs: rag.queuedJobs ?? 0,
			rag_failed_jobs: rag.failedJobs ?? 0,
			rag_worker_healthy: rag.workerHealthy ? 1 : 0,
			write_tools_enabled: safety.writeToolsEnabled ? 1 : 0
		} }), 'text/plain; version=0.0.4; charset=utf-8');
		return;
	}

	if (request.method === 'GET' && request.url === '/api/ai/health') {
		let rag;
		try {
			rag = await getRagStatus();
		} catch (error) {
			rag = { backend: 'error', error: error.message, queuedJobs: 0, failedJobs: 1, workerHealthy: false };
		}
		const status = historyBackend === 'postgresql' && rag.backend !== 'error' ? 'ok' : 'degraded';
		sendJson(response, status === 'ok' ? 200 : 503, {
			status,
			mode: getPublicAgentConfig().mode,
			historyBackend,
			enabled: isAiEnabled(),
			rag
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
				...getPublicAgentConfig(account),
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
			sendJson(response, 200, {
				metrics: getMetricsSnapshot(),
				policy: getSecurityPolicy(),
				providerCircuits: getProviderCircuitSnapshot()
			});
		} catch (error) {
			sendJson(response, errorStatus(error, 403), { error: error.message });
		}
		return;
	}

	if (request.method === 'GET' && request.url === '/api/ai/admin/health') {
		try {
			const account = await authenticate(request);
			requireAdminAccount(account);
			const rag = await getRagStatus();
			const safety = getRuntimeSafetyState();
			sendJson(response, 200, buildOperationalHealth({ historyBackend, rag, aiEnabled: isAiEnabled(), writeToolsEnabled: safety.writeToolsEnabled }));
		} catch (error) {
			sendJson(response, errorStatus(error, 503), { error: error.message });
		}
		return;
	}

	if (request.method === 'POST' && request.url === '/api/ai/admin/provider/test') {
		try {
			const account = await authenticate(request);
			requireAdminAccount(account);
			const payload = await readJson(request);
			const result = await testProviderConnection({ model: payload.model, account });
			incrementMetric('provider_connection_test_success_total');
			sendJson(response, 200, result);
		} catch (error) {
			incrementMetric('provider_connection_test_failed_total');
			sendJson(response, errorStatus(error, 502), { error: error.message, code: error.code ?? 'PROVIDER_TEST_FAILED' });
		}
		return;
	}

	if (request.url === '/api/ai/admin/safety' && ['GET', 'PUT'].includes(request.method ?? '')) {
		try {
			const account = await authenticate(request);
			requireAdminAccount(account);
			if (request.method === 'PUT') {
				const payload = await readJson(request);
				const safety = updateRuntimeSafetyState(payload);
				incrementMetric(safety.writeToolsEnabled ? 'write_tools_enabled_total' : 'write_tools_disabled_total');
				sendJson(response, 200, { safety });
			} else {
				sendJson(response, 200, { safety: getRuntimeSafetyState() });
			}
		} catch (error) {
			sendJson(response, errorStatus(error, 403), { error: error.message });
		}
		return;
	}

	if (request.method === 'GET' && request.url === '/api/ai/usage') {
		try {
			const account = await authenticate(request);
			sendJson(response, 200, { usage: await getAccountUsage(account.id) });
		} catch (error) {
			sendJson(response, errorStatus(error, 401), { error: error.message });
		}
		return;
	}

	if (requestUrl.pathname === '/api/ai/rag/sources' && request.method === 'GET') {
		try {
			const account = await authenticate(request);
			sendJson(response, 200, {
				sources: await listRagSources(account.id),
				privacy: {
					optIn: true,
					userScoped: true,
					storesSessionCookies: false,
					embeddingMode: 'self-hosted-or-local'
				}
			});
		} catch (error) {
			sendJson(response, errorStatus(error, 401), { error: error.message });
		}
		return;
	}

	if (requestUrl.pathname === '/api/ai/rag/sources' && request.method === 'PUT') {
		try {
			const account = await authenticate(request);
			const payload = await readJson(request);
			const module = payload.enabled
				? assertAvailableRagModule(payload.module)
				: assertRagModule(payload.module);
			const source = await setRagSource(account.id, module, Boolean(payload.enabled));
			incrementMetric(payload.enabled ? 'rag_source_enabled_total' : 'rag_source_disabled_total');
			sendJson(response, 200, { source });
		} catch (error) {
			sendJson(response, errorStatus(error), { error: error.message });
		}
		return;
	}

	if (requestUrl.pathname === '/api/ai/rag/sources/sync' && request.method === 'POST') {
		try {
			const account = await authenticate(request);
			await consumeAccountQuota(account.id);
			const payload = await readJson(request);
			const module = assertAvailableRagModule(payload.module);
			const documents = await collectRagDocuments(module, {
				cookie: request.headers.cookie ?? ''
			});
			const result = await enqueueRagDocuments(account.id, module, documents);
			incrementMetric('rag_sync_requested_total');
			incrementMetric('rag_documents_scanned_total', result.scanned ?? documents.length);
			incrementMetric('rag_documents_changed_total', result.queued ?? 0);
			incrementMetric('rag_documents_unchanged_total', result.unchanged ?? 0);
			incrementMetric('rag_documents_deleted_total', result.deleted ?? 0);
			sendJson(response, 202, { ...result, source: module });
		} catch (error) {
			sendJson(response, errorStatus(error, 500), { error: error.message });
		}
		return;
	}

	if (requestUrl.pathname === '/api/ai/rag/evaluate' && request.method === 'POST') {
		try {
			const account = await authenticate(request);
			await consumeAccountQuota(account.id);
			const payload = await readJson(request);
			const report = await evaluateRagCases(payload.cases, async (query, options) => {
				const results = await retrievePrivateRag(account.id, query, options);
				return revalidateRagResults(results, { cookie: request.headers.cookie ?? '' });
			});
			incrementMetric(report.summary.passed ? 'rag_evaluation_passed_total' : 'rag_evaluation_failed_total');
			sendJson(response, 200, report);
		} catch (error) {
			sendJson(response, errorStatus(error, 400), { error: error.message });
		}
		return;
	}

	if (request.url === '/api/ai/preferences' && ['GET', 'PUT'].includes(request.method ?? '')) {
		try {
			const account = await authenticate(request);
			if (request.method === 'PUT') {
				const payload = await readJson(request);
				const preferredModel = assertModelAllowed(payload.preferredModel, account);
				sendJson(response, 200, {
					preferences: await saveAccountPreferences(account.id, { preferredModel })
				});
				return;
			}
			const saved = await getAccountPreferences(account.id);
			const allowed = getModelAllowlist(account);
			const defaultModel = assertModelAllowed(
				allowed.includes(getAgentConfig().model) || allowed.includes('*')
					? getAgentConfig().model
					: allowed[0],
				account
			);
			const preferredModel =
				saved && (allowed.includes('*') || allowed.includes(saved.preferredModel))
					? saved.preferredModel
					: defaultModel;
			sendJson(response, 200, {
				preferences: {
					preferredModel,
					updatedAt: saved?.updatedAt ?? null
				}
			});
		} catch (error) {
			sendJson(response, errorStatus(error), { error: error.message });
		}
		return;
	}

	if (requestUrl.pathname === '/api/ai/admin/audit' && request.method === 'GET') {
		try {
			const account = await authenticate(request);
			requireAdminAccount(account);
			sendJson(response, 200, {
				entries: listAllAuditEntries(requestUrl.searchParams.get('limit') ?? 100)
			});
		} catch (error) {
			sendJson(response, errorStatus(error, 403), { error: error.message });
		}
		return;
	}

	if (request.method === 'GET' && request.url === '/api/ai/models') {
		try {
			const account = await authenticate(request);
			sendJson(response, 200, { models: await listAvailableModels(account) });
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

	const undoMatch = requestUrl.pathname.match(/^\/api\/ai\/audit\/([A-Za-z0-9-]{8,100})\/undo$/);
	if (undoMatch && request.method === 'POST') {
		let claimedUndo = null;
		try {
			const account = await authenticate(request);
			await consumeAccountQuota(account.id);
			const undo = getUndoAction(account.id, undoMatch[1]);
			if (!undo) {
				sendJson(response, 404, { error: 'Undo is unavailable, expired, or already used' });
				return;
			}
			const payload = await readJson(request);
			if (payload.confirmationToken) {
				if (!claimUndoAction(account.id, undo.auditId)) {
					sendJson(response, 409, { error: 'Undo is already being processed' });
					return;
				}
				claimedUndo = { ownerId: account.id, auditId: undo.auditId };
			}
			const execution = await executeTool({
				name: undo.tool,
				input: undo.input,
				context: {
					ownerId: account.id,
					accountName: account.name,
					cookie: request.headers.cookie ?? '',
					permissions: getToolPermissions(account),
					confirmationToken: payload.confirmationToken,
					idempotencyKey: payload.idempotencyKey,
					undoOf: undo.auditId
				}
			});
			if (execution.status === 'completed' && claimedUndo) {
				completeClaimedUndoAction(account.id, undo.auditId);
				claimedUndo = null;
			}
			sendJson(response, 200, { ...execution, undoOf: undo.auditId, expiresAt: undo.expiresAt });
		} catch (error) {
			if (claimedUndo) releaseUndoAction(claimedUndo.ownerId, claimedUndo.auditId);
			sendJson(response, errorStatus(error), { error: error.message });
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
			const permissions = getToolPermissions(account);
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
			const previousRevision = getPublicAgentConfig(account).configRevision;
			const updatedConfig = updateAgentConfig(payload);
			if (updatedConfig.configRevision !== previousRevision) {
				await purgeAllAccountPreferences();
			}
			sendJson(response, 200, {
				...updatedConfig,
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
		const payload = await readJson(request);
		if (typeof payload.message !== 'string' || !payload.message.trim()) {
			sendJson(response, 400, { error: 'message is required' });
			return;
		}
		const contextReference = normalizeContextReference(payload.context);
		await consumeAccountQuota(account.id);

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
		const controller = new AbortController();
		let requestProviderStatus = null;
		const cancel = () => controller.abort(new Error('Client disconnected'));
		request.once('aborted', cancel);
		response.once('close', cancel);

		try {
			await runAgent({
				message: payload.message.trim(),
				model: typeof payload.model === 'string' ? payload.model.trim() : '',
				contextReference,
				cookie: request.headers.cookie ?? '',
				account,
				permissions: getToolPermissions(account),
				emit,
				signal: controller.signal,
				onProviderStatus: (status) => {
					requestProviderStatus = status;
				}
			});
			if (requestProviderStatus) {
				emit('provider', {
					configuredModel: requestProviderStatus.configuredModel,
					activeModel: requestProviderStatus.activeModel,
					usedFallback: requestProviderStatus.usedFallback,
					latencyMs: requestProviderStatus.latencyMs
				});
			}
		} finally {
			request.off('aborted', cancel);
			response.off('close', cancel);
		}
		incrementMetric('chat_completed_total');
		if (wantsEventStream) {
			response.end();
		} else {
			sendJson(response, 200, { events });
		}
	} catch (error) {
		if (error?.name === 'AbortError' || error?.statusCode === 499) {
			incrementMetric('chat_cancelled_total');
			if (!response.writableEnded && !response.destroyed) response.end();
			return;
		}
		incrementMetric('chat_failed_total');
		if (!response.headersSent) {
			sendJson(
				response,
				errorStatus(error, 500),
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
			incrementMetric(`http_status_${Math.floor(response.statusCode / 100)}xx_total`);
			observeMetric('http_duration_ms', Date.now() - startedAt);
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
		void Promise.all([closeHistoryDatabase(), closeRagDatabase()]).finally(() => process.exit(0));
	});
	setTimeout(() => process.exit(1), 10_000).unref();
};

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
