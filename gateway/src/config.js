import fs from 'node:fs';
import path from 'node:path';

import { parseScopedPolicy, resolveScopedPolicy } from './account-policy.js';

const configDirectory = path.resolve('.runtime');
const configFile = path.join(configDirectory, 'config.json');

const loadSavedConfig = () => {
	try {
		return JSON.parse(fs.readFileSync(configFile, 'utf8'));
	} catch {
		return {};
	}
};

const savedConfig = loadSavedConfig();

const parseAllowlist = (value) =>
	String(value ?? '')
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean);

export const PROVIDERS = {
	openrouter: {
		name: 'OpenRouter',
		endpoint: 'https://openrouter.ai/api/v1',
		defaultModel: 'openrouter/free',
		protocol: 'openai'
	},
	openai: {
		name: 'OpenAI',
		endpoint: 'https://api.openai.com/v1',
		defaultModel: 'gpt-5.4-mini',
		protocol: 'openai'
	},
	anthropic: {
		name: 'Anthropic Claude',
		endpoint: 'https://api.anthropic.com/v1/messages',
		defaultModel: 'claude-sonnet-4-6',
		protocol: 'anthropic'
	},
	deepseek: {
		name: 'DeepSeek',
		endpoint: 'https://api.deepseek.com',
		defaultModel: 'deepseek-v4-flash',
		protocol: 'openai'
	},
	gemini: {
		name: 'Google Gemini',
		endpoint: 'https://generativelanguage.googleapis.com/v1beta',
		defaultModel: 'gemini-3.5-flash',
		protocol: 'gemini'
	},
	custom: {
		name: 'Custom endpoint',
		endpoint: '',
		defaultModel: '',
		protocol: 'custom'
	}
};

const inferProvider = (url) => {
	if (url?.includes('openrouter.ai')) return 'openrouter';
	if (url?.includes('api.openai.com')) return 'openai';
	if (url?.includes('anthropic.com')) return 'anthropic';
	if (url?.includes('deepseek.com')) return 'deepseek';
	if (url?.includes('generativelanguage.googleapis.com')) return 'gemini';
	return url ? 'custom' : 'openrouter';
};

const initialProvider =
	process.env.AI_AGENT_PROVIDER ??
	savedConfig.provider ??
	(process.env.AI_AGENT_URL ? inferProvider(process.env.AI_AGENT_URL) : 'custom');
const runtimeConfig = {
	provider: initialProvider,
	agentUrl:
		process.env.AI_AGENT_URL ??
		savedConfig.agentUrl ??
		PROVIDERS[initialProvider]?.endpoint ??
		'',
	apiKey: process.env.AI_AGENT_API_KEY ?? savedConfig.apiKey ?? '',
	model:
		process.env.AI_AGENT_MODEL ??
		savedConfig.model ??
		PROVIDERS[initialProvider]?.defaultModel ??
		''
};

const providerAllowlist = new Set(
	parseAllowlist(
		process.env.AI_PROVIDER_ALLOWLIST ?? 'openrouter,openai,anthropic,deepseek,gemini'
	)
);
const modelPolicy = parseScopedPolicy(process.env.AI_MODEL_POLICY_JSON, 'AI_MODEL_POLICY_JSON');

export const getModelAllowlist = (account) => {
	const configured = parseAllowlist(process.env.AI_MODEL_ALLOWLIST);
	const globalAllowlist = configured.length ? configured : [runtimeConfig.model].filter(Boolean);
	return resolveScopedPolicy(modelPolicy, account, globalAllowlist);
};

export const assertModelAllowed = (model, account) => {
	const normalized = String(model || runtimeConfig.model).trim();
	const allowed = getModelAllowlist(account);
	if (!normalized || (!allowed.includes('*') && !allowed.includes(normalized))) {
		throw new Error('Model is not allowed by administrator policy');
	}
	return normalized;
};

const validateCustomEndpoint = (url) => {
	if (process.env.AI_ALLOW_CUSTOM_ENDPOINT !== 'true') {
		throw new Error('Custom endpoints are disabled by administrator policy');
	}
	const parsed = new URL(url);
	if (parsed.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
		throw new Error('Custom endpoint must use HTTPS in production');
	}
	if (parsed.username || parsed.password) throw new Error('Endpoint credentials are not allowed');
	const allowedHosts = parseAllowlist(process.env.AI_CUSTOM_ENDPOINT_HOSTS).map((host) =>
		host.toLowerCase()
	);
	if (!allowedHosts.length || !allowedHosts.includes(parsed.hostname.toLowerCase())) {
		throw new Error('Custom endpoint host is not allowlisted');
	}
};

const persistConfig = () => {
	fs.mkdirSync(configDirectory, { recursive: true, mode: 0o700 });
	fs.writeFileSync(configFile, JSON.stringify(runtimeConfig, null, 2), { mode: 0o600 });
	fs.chmodSync(configFile, 0o600);
};

export const getAgentConfig = () => ({ ...runtimeConfig });

export const getPublicAgentConfig = (account) => ({
	provider: runtimeConfig.provider,
	agentUrl: runtimeConfig.agentUrl,
	hasApiKey: Boolean(runtimeConfig.apiKey),
	model: runtimeConfig.model,
	mode: runtimeConfig.provider === 'custom' && !runtimeConfig.agentUrl ? 'local-agent' : 'remote-agent',
	modelAllowlist: getModelAllowlist(account),
	processingDisclosure:
		'Prompts and only the mailbox data needed for your request may be sent to the configured AI provider.'
});

export const updateAgentConfig = ({
	provider,
	agentUrl = '',
	apiKey,
	model,
	clearApiKey = false
}) => {
	const nextProvider = provider ?? runtimeConfig.provider;
	if (!PROVIDERS[nextProvider]) throw new Error('Unsupported provider');
	if (!providerAllowlist.has(nextProvider)) {
		throw new Error('Provider is not allowed by administrator policy');
	}
	if (typeof agentUrl !== 'string') throw new Error('agentUrl must be a string');
	const normalizedUrl =
		nextProvider === 'custom' ? agentUrl.trim() : PROVIDERS[nextProvider].endpoint;
	if (normalizedUrl) {
		const parsed = new URL(normalizedUrl);
		if (!['http:', 'https:'].includes(parsed.protocol)) {
			throw new Error('Agent URL must use HTTP or HTTPS');
		}
	}
	if (nextProvider === 'custom') validateCustomEndpoint(normalizedUrl);
	const nextModel = assertModelAllowed(
		typeof model === 'string' && model.trim() ? model.trim() : PROVIDERS[nextProvider].defaultModel
	);

	if (nextProvider !== runtimeConfig.provider && !apiKey) runtimeConfig.apiKey = '';
	runtimeConfig.provider = nextProvider;
	runtimeConfig.agentUrl = normalizedUrl;
	runtimeConfig.model = nextModel;
	if (clearApiKey) runtimeConfig.apiKey = '';
	if (typeof apiKey === 'string' && apiKey.trim()) runtimeConfig.apiKey = apiKey.trim();
	persistConfig();

	return getPublicAgentConfig();
};
