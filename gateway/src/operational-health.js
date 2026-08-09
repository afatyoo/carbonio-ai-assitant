import { getAgentConfig, getPublicAgentConfig } from './config.js';
import { getMetricsSnapshot } from './metrics.js';
import { getProviderCircuitSnapshot } from './provider-circuit-breaker.js';
import { getProviderStatus } from './provider-status.js';

const component = (status, detail, observedAt = Date.now()) => ({ status, detail, observedAt });

export const buildOperationalHealth = ({
	historyBackend,
	rag,
	aiEnabled,
	writeToolsEnabled
}) => {
	const config = getAgentConfig();
	const provider = getProviderStatus();
	const circuits = getProviderCircuitSnapshot();
	const configuredCircuit = circuits.find(({ provider: name }) => name === config.provider);
	const providerStatus = configuredCircuit?.state === 'open'
		? 'error'
		: provider.status === 'error'
			? 'error'
			: provider.status === 'degraded'
				? 'degraded'
				: config.agentUrl && config.apiKey
					? provider.status
					: 'unconfigured';
	const ragStatus = rag.backend !== 'postgresql'
		? 'disabled'
		: rag.workerHealthy === false || rag.failedJobs > 0
			? 'degraded'
			: 'healthy';
	const components = {
		gateway: component('healthy', 'Loopback gateway is serving requests'),
		history: component(historyBackend === 'postgresql' ? 'healthy' : 'degraded', historyBackend),
		rag: component(ragStatus, `${rag.backend}; queued=${rag.queuedJobs ?? 0}; failed=${rag.failedJobs ?? 0}`),
		provider: component(providerStatus, provider.errorCode || provider.model || config.model),
		writes: component(writeToolsEnabled ? 'enabled' : 'disabled', writeToolsEnabled ? 'Write tools enabled' : 'Emergency write stop active')
	};
	const values = Object.values(components).map(({ status }) => status);
	const status = !aiEnabled || values.includes('error')
		? 'error'
		: values.includes('degraded') || values.includes('unconfigured')
			? 'degraded'
			: 'healthy';
	return {
		status,
		components,
		provider,
		providerCircuits: circuits,
		config: {
			provider: config.provider,
			model: config.model,
			fallbackModels: config.fallbackModels ?? [],
			configRevision: getPublicAgentConfig().configRevision
		},
		metrics: getMetricsSnapshot()
	};
};
