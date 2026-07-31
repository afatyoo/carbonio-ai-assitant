type ApiErrorPayload = {
	error?: unknown;
	message?: unknown;
};

const getApiErrorMessage = (payload: ApiErrorPayload): string | undefined => {
	if (typeof payload.error === 'string') return payload.error;
	if (typeof payload.message === 'string') return payload.message;
	return undefined;
};

export const parseJsonResponse = async <T>(
	response: Response,
	service = 'AI gateway'
): Promise<T> => {
	const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
	const body = await response.text();
	let payload: ApiErrorPayload | undefined;

	if (contentType.includes('application/json') && body) {
		try {
			payload = JSON.parse(body) as ApiErrorPayload;
		} catch {
			throw new Error(`${service} mengembalikan JSON yang tidak valid`);
		}
	}

	if (!response.ok) {
		if (response.status === 404 && !payload) {
			throw new Error(`${service} belum terpasang atau proxy API belum dikonfigurasi`);
		}
		throw new Error(getApiErrorMessage(payload ?? {}) ?? `${service} HTTP ${response.status}`);
	}

	if (!contentType.includes('application/json')) {
		throw new Error(`${service} mengembalikan respons non-JSON`);
	}

	if (!body) throw new Error(`${service} mengembalikan respons kosong`);
	return payload as T;
};
