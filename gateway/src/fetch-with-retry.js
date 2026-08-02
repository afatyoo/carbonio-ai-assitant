const RETRYABLE_STATUSES = new Set([429, 502, 503]);

const wait = (milliseconds) =>
	new Promise((resolve) => {
		setTimeout(resolve, milliseconds);
	});

const backoffDelay = (attempt) => {
	const base = 250 * 2 ** Math.max(attempt - 1, 0);
	return base + Math.floor(Math.random() * Math.max(Math.floor(base / 2), 1));
};

export const fetchWithRetry = async (
	url,
	options = {},
	{ timeoutMs = 75_000, maxAttempts = 3, onRetry } = {}
) => {
	const deadline = Date.now() + timeoutMs;
	let lastError;

	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		const remaining = deadline - Date.now();
		if (remaining <= 0) throw new Error(`Request timed out after ${timeoutMs} ms`);
		try {
			const response = await fetch(url, {
				...options,
				signal: AbortSignal.timeout(remaining)
			});
			if (!RETRYABLE_STATUSES.has(response.status) || attempt === maxAttempts) {
				return response;
			}
			await response.body?.cancel();
			const delayMs = Math.min(backoffDelay(attempt), Math.max(deadline - Date.now(), 0));
			onRetry?.({ attempt, delayMs, status: response.status });
			if (delayMs > 0) await wait(delayMs);
		} catch (error) {
			lastError = error;
			if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
				throw new Error(`Request timed out after ${timeoutMs} ms`, { cause: error });
			}
			if (attempt === maxAttempts) throw error;
			const delayMs = Math.min(backoffDelay(attempt), Math.max(deadline - Date.now(), 0));
			onRetry?.({ attempt, delayMs, error });
			if (delayMs > 0) await wait(delayMs);
		}
	}

	throw lastError ?? new Error('Request failed');
};
