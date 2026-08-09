import { getI18n } from '@zextras/carbonio-shell-ui';

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

const localizedTransportError = (key: string, fallback: string, service: string): string =>
	String(getI18n().t(key, { defaultValue: fallback, service }));

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
			throw new Error(
				`${localizedTransportError('errors.invalid_json', '{{service}} returned invalid JSON', service)}${requestSuffix}`
			);
		}
	}

	if (!response.ok) {
		if (response.status === 404 && !payload) {
			throw new Error(
				`${localizedTransportError(
					'errors.not_installed',
					'{{service}} is not installed or the API proxy is not configured',
					service
				)}${requestSuffix}`
			);
		}
		const message = getApiErrorMessage(payload ?? {}) ?? `${service} HTTP ${response.status}`;
		throw new Error(`${message}${requestSuffix}`);
	}

	if (!contentType.includes('application/json')) {
		throw new Error(
			`${localizedTransportError('errors.non_json', '{{service}} returned a non-JSON response', service)}${requestSuffix}`
		);
	}

	if (!body) {
		throw new Error(
			`${localizedTransportError('errors.empty_response', '{{service}} returned an empty response', service)}${requestSuffix}`
		);
	}
	return payload as T;
};
