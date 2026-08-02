export const createAgentStreamError = (message: string, requestId: string): Error => {
	const normalizedMessage = message.trim() || 'AI Agent stream failed';
	const normalizedRequestId = requestId.trim();
	return new Error(
		`${normalizedMessage}${normalizedRequestId ? ` (request ID: ${normalizedRequestId})` : ''}`
	);
};
