const normalizeLimit = (value, fallback, maximum) => {
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < 1) return fallback;
	return Math.min(parsed, maximum);
};

export const responseLimitFromEnvironment = (name, fallback, maximum = 50_000_000) =>
	normalizeLimit(process.env[name], fallback, maximum);

export const readBoundedResponseBuffer = async (response, maxBytes) => {
	const boundedMaxBytes = normalizeLimit(maxBytes, 2_000_000, 50_000_000);
	const declaredLength = Number(response.headers?.get?.('content-length'));
	if (Number.isFinite(declaredLength) && declaredLength > boundedMaxBytes) {
		await response.body?.cancel().catch(() => {});
		throw new Error(`Upstream response exceeds ${boundedMaxBytes} bytes`);
	}
	if (!response.body) return Buffer.alloc(0);

	const reader = response.body.getReader();
	const chunks = [];
	let size = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			size += value.byteLength;
			if (size > boundedMaxBytes) {
				await reader.cancel('Upstream response is too large').catch(() => {});
				throw new Error(`Upstream response exceeds ${boundedMaxBytes} bytes`);
			}
			chunks.push(Buffer.from(value));
		}
	} finally {
		reader.releaseLock();
	}
	return Buffer.concat(chunks, size);
};

export const readBoundedResponseText = async (response, maxBytes) => {
	if (response.body?.getReader) {
		return (await readBoundedResponseBuffer(response, maxBytes)).toString('utf8');
	}
	const text = String(await response.text());
	const boundedMaxBytes = normalizeLimit(maxBytes, 2_000_000, 50_000_000);
	if (Buffer.byteLength(text, 'utf8') > boundedMaxBytes) {
		throw new Error(`Upstream response exceeds ${boundedMaxBytes} bytes`);
	}
	return text;
};

export const readBoundedResponseJson = async (response, maxBytes) => {
	if (!response.body?.getReader && typeof response.json === 'function') {
		const data = await response.json();
		if (Buffer.byteLength(JSON.stringify(data), 'utf8') > normalizeLimit(maxBytes, 2_000_000, 50_000_000)) {
			throw new Error(`Upstream response exceeds ${maxBytes} bytes`);
		}
		return data;
	}
	const text = await readBoundedResponseText(response, maxBytes);
	try {
		return JSON.parse(text);
	} catch (error) {
		throw new Error('Upstream returned invalid JSON', { cause: error });
	}
};
