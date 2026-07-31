import { parseJsonResponse } from '../api/response';

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
export const RENAME_CHAT_EVENT = 'carbonio-ai:rename-chat';

export const getConversations = async (): Promise<StoredConversation[]> => {
	const data = await parseJsonResponse<{ conversations: StoredConversation[] }>(
		await fetch('/api/ai/conversations'),
		'History API'
	);
	return data.conversations;
};

export const getConversation = async (id: string): Promise<StoredConversation> =>
	parseJsonResponse<StoredConversation>(
		await fetch(`/api/ai/conversations/${id}`),
		'History API'
	);

export const saveConversation = async (
	conversation: StoredConversation
): Promise<StoredConversation> => {
	const saved = await parseJsonResponse<StoredConversation>(
		await fetch(`/api/ai/conversations/${conversation.id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(conversation)
		}),
		'History API'
	);
	window.dispatchEvent(new Event(HISTORY_CHANGED_EVENT));
	return saved;
};

export const renameConversation = async (
	id: string,
	title: string
): Promise<StoredConversation> => {
	const conversation = await getConversation(id);
	const saved = await saveConversation({ ...conversation, title: title.trim().slice(0, 120) });
	window.dispatchEvent(
		new CustomEvent(RENAME_CHAT_EVENT, { detail: { id: saved.id, title: saved.title } })
	);
	return saved;
};

export const deleteConversation = async (id: string): Promise<void> => {
	const response = await fetch(`/api/ai/conversations/${id}`, { method: 'DELETE' });
	if (!response.ok) {
		await parseJsonResponse(response, 'History API');
	}
	window.dispatchEvent(new Event(HISTORY_CHANGED_EVENT));
};

export const createConversationId = (): string =>
	`${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
