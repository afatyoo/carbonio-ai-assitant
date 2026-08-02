import { incrementMetric, setMetric } from './metrics.js';

const normalizeInteger = (value, fallback, minimum, maximum) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), minimum), maximum) : fallback;
};

export const createProviderCircuitBreaker = ({
	failureThreshold = 5,
	cooldownMs = 30_000,
	now = () => Date.now()
} = {}) => {
	const threshold = normalizeInteger(failureThreshold, 5, 1, 100);
	const cooldown = normalizeInteger(cooldownMs, 30_000, 1_000, 900_000);
	const states = new Map();

	const getState = (provider) => {
		const key = String(provider || 'unknown');
		if (!states.has(key)) {
			states.set(key, {
				provider: key,
				state: 'closed',
				consecutiveFailures: 0,
				openedAt: null,
				openUntil: null,
				probeInFlight: false
			});
		}
		return states.get(key);
	};

	const beforeRequest = (provider) => {
		const state = getState(provider);
		const currentTime = now();
		if (state.state === 'open' && currentTime >= state.openUntil) {
			state.state = 'half-open';
			state.probeInFlight = false;
		}
		if (state.state === 'open' || (state.state === 'half-open' && state.probeInFlight)) {
			const error = new Error('AI provider circuit is temporarily open');
			error.statusCode = 503;
			error.code = 'PROVIDER_CIRCUIT_OPEN';
			error.retryAfterMs = Math.max(Number(state.openUntil ?? currentTime) - currentTime, 0);
			throw error;
		}
		if (state.state === 'half-open') state.probeInFlight = true;
		return { provider: state.provider, halfOpenProbe: state.state === 'half-open' };
	};

	const recordSuccess = (provider) => {
		const state = getState(provider);
		state.state = 'closed';
		state.consecutiveFailures = 0;
		state.openedAt = null;
		state.openUntil = null;
		state.probeInFlight = false;
	};

	const recordFailure = (provider) => {
		const state = getState(provider);
		state.probeInFlight = false;
		state.consecutiveFailures += 1;
		if (state.state === 'half-open' || state.consecutiveFailures >= threshold) {
			state.state = 'open';
			state.openedAt = now();
			state.openUntil = state.openedAt + cooldown;
		}
		return state.state;
	};

	const recordCancellation = (provider) => {
		const state = getState(provider);
		if (state.state === 'half-open') {
			state.state = 'open';
			state.openedAt = now();
			state.openUntil = state.openedAt + cooldown;
		}
		state.probeInFlight = false;
	};

	const snapshot = () =>
		[...states.values()].map((state) => ({
			provider: state.provider,
			state: state.state,
			consecutiveFailures: state.consecutiveFailures,
			openedAt: state.openedAt,
			openUntil: state.openUntil
		}));

	return { beforeRequest, recordSuccess, recordFailure, recordCancellation, snapshot };
};

const breaker = createProviderCircuitBreaker({
	failureThreshold: process.env.AI_PROVIDER_CIRCUIT_FAILURES,
	cooldownMs: process.env.AI_PROVIDER_CIRCUIT_COOLDOWN_MS
});

export const beforeProviderRequest = (provider) => {
	try {
		return breaker.beforeRequest(provider);
	} catch (error) {
		incrementMetric('provider_circuit_rejected_total');
		throw error;
	}
};

export const recordProviderSuccess = (provider) => {
	breaker.recordSuccess(provider);
	setMetric(`provider_circuit_${provider}_open`, 0);
};

export const recordProviderFailure = (provider) => {
	const state = breaker.recordFailure(provider);
	incrementMetric('provider_circuit_failure_total');
	setMetric(`provider_circuit_${provider}_open`, state === 'open' ? 1 : 0);
};

export const recordProviderCancellation = (provider) => {
	breaker.recordCancellation(provider);
	incrementMetric('provider_cancelled_total');
};

export const getProviderCircuitSnapshot = () => breaker.snapshot();
