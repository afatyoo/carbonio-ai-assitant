import { parseJsonResponse } from './response';

export type AgentEvent = {
	event: string;
	data: {
		text?: string;
		name?: string;
		status?: string;
		count?: number;
		message?: string;
		tool?: string;
		token?: string;
		expiresAt?: number;
		idempotencyKey?: string;
		preview?: {
			kind?: string;
			to?: string;
			cc?: string;
			bcc?: string;
			subject?: string;
			body?: string;
		};
		input?: Record<string, string>;
	};
};

type JsonAgentResponse = {
	events: AgentEvent[];
};

const parseEventBlock = (block: string): AgentEvent | null => {
	let event = 'message';
	const dataLines: string[] = [];
	for (const line of block.split('\n')) {
		if (line.startsWith('event:')) event = line.slice(6).trim();
		if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
	}
	if (dataLines.length === 0) return null;
	return { event, data: JSON.parse(dataLines.join('\n')) as AgentEvent['data'] };
};

export const readAgentEvents = async (
	response: Response,
	onEvent: (event: AgentEvent) => void
): Promise<void> => {
	const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
	if (!response.ok || contentType.includes('application/json')) {
		const result = await parseJsonResponse<JsonAgentResponse>(response);
		for (const event of result.events) onEvent(event);
		return;
	}
	if (!contentType.includes('text/event-stream') || !response.body) {
		throw new Error('AI gateway returned an invalid event stream');
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	const consume = (block: string): void => {
		const event = parseEventBlock(block);
		if (!event) return;
		if (event.event === 'error') {
			throw new Error(event.data.message || 'AI Agent stream failed');
		}
		onEvent(event);
	};

	while (true) {
		const { done, value } = await reader.read();
		buffer += decoder.decode(value, { stream: !done });
		let boundary = buffer.indexOf('\n\n');
		while (boundary >= 0) {
			consume(buffer.slice(0, boundary));
			buffer = buffer.slice(boundary + 2);
			boundary = buffer.indexOf('\n\n');
		}
		if (done) break;
	}
	if (buffer.trim()) consume(buffer);
};
