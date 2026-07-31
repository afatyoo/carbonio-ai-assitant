export type ChatMessage = {
	id: number;
	role: 'assistant' | 'user';
	text: string;
};

export type StoredConversation = {
	id: string;
	title: string;
	createdAt: number;
	updatedAt: number;
	model: string;
	messages: ChatMessage[];
};

export const HISTORY_CHANGED_EVENT = 'carbonio-ai:history-changed';
export const OPEN_CHAT_EVENT = 'carbonio-ai:open-chat';
export const NEW_CHAT_EVENT = 'carbonio-ai:new-chat';

const parseResponse = async <T>(response: Response): Promise<T> => {
	const data = (await response.json()) as T & { error?: string };
	if (!response.ok) throw new Error(data.error ?? `History API HTTP ${response.status}`);
	return data;
};

export const getConversations = async (): Promise<StoredConversation[]> => {
	const data = await parseResponse<{ conversations: StoredConversation[] }>(
		await fetch('/api/ai/conversations')
	);
	return data.conversations;
};

export const getConversation = async (id: string): Promise<StoredConversation> =>
	parseResponse<StoredConversation>(await fetch(`/api/ai/conversations/${id}`));

export const saveConversation = async (
	conversation: StoredConversation
): Promise<StoredConversation> => {
	const saved = await parseResponse<StoredConversation>(
		await fetch(`/api/ai/conversations/${conversation.id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(conversation)
		})
	);
	window.dispatchEvent(new Event(HISTORY_CHANGED_EVENT));
	return saved;
};

export const createConversationId = (): string =>
	`${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
