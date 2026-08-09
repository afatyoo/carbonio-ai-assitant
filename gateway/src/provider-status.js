const state = {
	status: 'untested',
	provider: '',
	model: '',
	configuredModel: '',
	usedFallback: false,
	latencyMs: null,
	lastStatusCode: null,
	lastCheckedAt: null,
	lastSuccessAt: null,
	errorCode: ''
};

const safeErrorCode = (error) =>
	String(error?.code ?? error?.statusCode ?? error?.message ?? 'PROVIDER_ERROR')
		.replace(/[^A-Za-z0-9_.-]/g, '_')
		.slice(0, 120);

export const recordProviderStatus = ({
	provider,
	model,
	configuredModel = model,
	usedFallback = false,
	latencyMs,
	statusCode = 200,
	error = null
}) => {
	const now = Date.now();
	Object.assign(state, {
		status: error ? 'error' : usedFallback ? 'degraded' : 'healthy',
		provider: String(provider ?? ''),
		model: String(model ?? ''),
		configuredModel: String(configuredModel ?? ''),
		usedFallback: Boolean(usedFallback),
		latencyMs: Number.isFinite(Number(latencyMs)) ? Number(latencyMs) : null,
		lastStatusCode: Number.isFinite(Number(statusCode)) ? Number(statusCode) : null,
		lastCheckedAt: now,
		...(error ? { errorCode: safeErrorCode(error) } : { lastSuccessAt: now, errorCode: '' })
	});
	return getProviderStatus();
};

export const getProviderStatus = () => ({ ...state });

export const resetProviderStatus = () => {
	Object.assign(state, {
		status: 'untested',
		provider: '',
		model: '',
		configuredModel: '',
		usedFallback: false,
		latencyMs: null,
		lastStatusCode: null,
		lastCheckedAt: null,
		lastSuccessAt: null,
		errorCode: ''
	});
};
