const RETRYABLE_STATUSES = new Set([429, 502, 503]);

const cancellationError = (cause) => {
	const error = new Error('Request cancelled', { cause });
	error.name = 'AbortError';
	error.statusCode = 499;
	return error;
};

const wait = (milliseconds, signal) =>
	new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(cancellationError(signal.reason));
			return;
		}
		const onAbort = () => {
				clearTimeout(timeout);
				reject(cancellationError(signal.reason));
		};
		const timeout = setTimeout(() => {
			signal?.removeEventListener('abort', onAbort);
			resolve();
		}, milliseconds);
		signal?.addEventListener('abort', onAbort, { once: true });
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
		if (options.signal?.aborted) throw cancellationError(options.signal.reason);
		const remaining = deadline - Date.now();
		if (remaining <= 0) throw new Error(`Request timed out after ${timeoutMs} ms`);
		try {
			const timeoutSignal = AbortSignal.timeout(remaining);
			const signal = options.signal
				? AbortSignal.any([options.signal, timeoutSignal])
				: timeoutSignal;
			const response = await fetch(url, {
				...options,
				signal
			});
			if (!RETRYABLE_STATUSES.has(response.status) || attempt === maxAttempts) {
				return response;
			}
			await response.body?.cancel();
			const delayMs = Math.min(backoffDelay(attempt), Math.max(deadline - Date.now(), 0));
			onRetry?.({ attempt, delayMs, status: response.status });
			if (delayMs > 0) await wait(delayMs, options.signal);
		} catch (error) {
			lastError = error;
			if (options.signal?.aborted) throw cancellationError(options.signal.reason);
			if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
				throw new Error(`Request timed out after ${timeoutMs} ms`, { cause: error });
			}
			if (attempt === maxAttempts) throw error;
			const delayMs = Math.min(backoffDelay(attempt), Math.max(deadline - Date.now(), 0));
			onRetry?.({ attempt, delayMs, error });
			if (delayMs > 0) await wait(delayMs, options.signal);
		}
	}

	throw lastError ?? new Error('Request failed');
};
