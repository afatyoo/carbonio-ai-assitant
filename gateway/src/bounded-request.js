const bodyTooLargeError = () => {
	const error = new Error('Request body is too large');
	error.statusCode = 413;
	return error;
};

export const readJson = async (request, maxBytes = 64_000) => {
	const declaredLength = Number(request.headers?.['content-length']);
	if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
		throw bodyTooLargeError();
	}
	const chunks = [];
	let size = 0;
	for await (const chunk of request) {
		size += chunk.length;
		if (size > maxBytes) {
			request.resume?.();
			throw bodyTooLargeError();
		}
		chunks.push(chunk);
	}
	return JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
};
