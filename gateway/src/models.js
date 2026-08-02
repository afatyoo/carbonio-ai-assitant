import { getAgentConfig } from './config.js';
import { fetchWithRetry } from './fetch-with-retry.js';
import { logEvent } from './logger.js';

let cache = { key: '', expiresAt: 0, items: [] };

export const listAvailableModels = async () => {
	const config = getAgentConfig();
	const cacheKey = `${config.provider}:${config.agentUrl}`;
	if (cache.key === cacheKey && Date.now() < cache.expiresAt && cache.items.length) {
		return cache.items;
	}

	const predefined = {
		openai: [
			{ id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini' },
			{ id: 'gpt-5.4', name: 'GPT-5.4' }
		],
		anthropic: [
			{ id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' },
			{ id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' }
		],
		deepseek: [
			{ id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' },
			{ id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' }
		],
		gemini: [
			{ id: 'gemini-3.5-flash', name: 'Gemini 3.5 Flash' },
			{ id: 'gemini-3.5-pro', name: 'Gemini 3.5 Pro' }
		],
		custom: [{ id: config.model, name: config.model }]
	};
	if (config.provider !== 'openrouter') {
		return (predefined[config.provider] ?? predefined.custom).map((model) => ({
			...model,
			free: false
		}));
	}

	const startedAt = Date.now();
	const response = await fetchWithRetry(
		`${config.agentUrl.replace(/\/$/, '')}/models`,
		{
			headers: config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}
		},
		{
			timeoutMs: 15_000,
			onRetry: ({ attempt, delayMs, status, error }) =>
				logEvent('warn', 'models_retry', {
					provider: config.provider,
					attempt,
					delay_ms: delayMs,
					status,
					error
				})
		}
	);
	logEvent('info', 'models_response', {
		provider: config.provider,
		status: response.status,
		duration_ms: Date.now() - startedAt
	});
	if (!response.ok) throw new Error(`Unable to load models: HTTP ${response.status}`);
	const data = await response.json();
	const freeModels = (data.data ?? [])
		.filter(
			(model) =>
				Number(model.pricing?.prompt ?? 1) === 0 &&
				Number(model.pricing?.completion ?? 1) === 0
		)
		.map((model) => ({
			id: model.id,
			name: model.name ?? model.id,
			contextLength: model.context_length,
			free: true
		}))
		.sort((left, right) => left.name.localeCompare(right.name));

	cache = {
		key: cacheKey,
		expiresAt: Date.now() + 5 * 60_000,
		items: [
			{
				id: 'openrouter/free',
				name: 'Auto — Free Models Router',
				free: true
			},
			...freeModels.filter((model) => model.id !== 'openrouter/free')
		]
	};
	return cache.items;
};
