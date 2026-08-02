type ApiErrorPayload = {
	error?: unknown;
	message?: unknown;
};

const getApiErrorMessage = (payload: ApiErrorPayload): string | undefined => {
	if (typeof payload.error === 'string') return payload.error;
	if (typeof payload.message === 'string') return payload.message;
	return undefined;
};

const createRequestId = (): string =>
	typeof globalThis.crypto?.randomUUID === 'function'
		? globalThis.crypto.randomUUID()
		: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export const apiFetch = (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
	const headers = new Headers(init.headers);
	headers.set('x-request-id', createRequestId());
	return fetch(input, { ...init, headers });
};

export const parseJsonResponse = async <T>(
	response: Response,
	service = 'AI gateway'
): Promise<T> => {
	const requestId = response.headers.get('x-request-id');
	const requestSuffix = requestId ? ` (request ID: ${requestId})` : '';
	const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
	const body = await response.text();
	let payload: ApiErrorPayload | undefined;

	if (contentType.includes('application/json') && body) {
		try {
			payload = JSON.parse(body) as ApiErrorPayload;
		} catch {
			throw new Error(`${service} mengembalikan JSON yang tidak valid${requestSuffix}`);
		}
	}

	if (!response.ok) {
		if (response.status === 404 && !payload) {
			throw new Error(
				`${service} belum terpasang atau proxy API belum dikonfigurasi${requestSuffix}`
			);
		}
		const message = getApiErrorMessage(payload ?? {}) ?? `${service} HTTP ${response.status}`;
		throw new Error(`${message}${requestSuffix}`);
	}

	if (!contentType.includes('application/json')) {
		throw new Error(`${service} mengembalikan respons non-JSON${requestSuffix}`);
	}

	if (!body) throw new Error(`${service} mengembalikan respons kosong${requestSuffix}`);
	return payload as T;
};
