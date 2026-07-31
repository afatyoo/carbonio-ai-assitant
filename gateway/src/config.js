import fs from 'node:fs';
import path from 'node:path';

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

const persistConfig = () => {
	fs.mkdirSync(configDirectory, { recursive: true, mode: 0o700 });
	fs.writeFileSync(configFile, JSON.stringify(runtimeConfig, null, 2), { mode: 0o600 });
	fs.chmodSync(configFile, 0o600);
};

export const getAgentConfig = () => ({ ...runtimeConfig });

export const getPublicAgentConfig = () => ({
	provider: runtimeConfig.provider,
	agentUrl: runtimeConfig.agentUrl,
	hasApiKey: Boolean(runtimeConfig.apiKey),
	model: runtimeConfig.model,
	mode: runtimeConfig.provider === 'custom' && !runtimeConfig.agentUrl ? 'local-agent' : 'remote-agent'
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
	if (typeof agentUrl !== 'string') throw new Error('agentUrl must be a string');
	const normalizedUrl =
		nextProvider === 'custom' ? agentUrl.trim() : PROVIDERS[nextProvider].endpoint;
	if (normalizedUrl) {
		const parsed = new URL(normalizedUrl);
		if (!['http:', 'https:'].includes(parsed.protocol)) {
			throw new Error('Agent URL must use HTTP or HTTPS');
		}
	}

	if (nextProvider !== runtimeConfig.provider && !apiKey) runtimeConfig.apiKey = '';
	runtimeConfig.provider = nextProvider;
	runtimeConfig.agentUrl = normalizedUrl;
	runtimeConfig.model =
		typeof model === 'string' && model.trim()
			? model.trim()
			: PROVIDERS[nextProvider].defaultModel;
	if (clearApiKey) runtimeConfig.apiKey = '';
	if (typeof apiKey === 'string' && apiKey.trim()) runtimeConfig.apiKey = apiKey.trim();
	persistConfig();

	return getPublicAgentConfig();
};
