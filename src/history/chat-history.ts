import { apiFetch, parseJsonResponse } from '../api/response';

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
	messageCount?: number;
	deletedAt?: number | null;
};

export type StoredConversationSummary = Omit<StoredConversation, 'messages'>;

export type ConversationPage = {
	conversations: StoredConversationSummary[];
	nextCursor: string | null;
};

export const HISTORY_CHANGED_EVENT = 'carbonio-ai:history-changed';
export const OPEN_CHAT_EVENT = 'carbonio-ai:open-chat';
export const NEW_CHAT_EVENT = 'carbonio-ai:new-chat';
export const RENAME_CHAT_EVENT = 'carbonio-ai:rename-chat';

export const getConversationPage = async (
	cursor = '',
	limit = 20,
	query = ''
): Promise<ConversationPage> => {
	const params = new URLSearchParams({ limit: String(limit) });
	if (cursor) params.set('cursor', cursor);
	if (query.trim()) params.set('q', query.trim().slice(0, 100));
	return parseJsonResponse<ConversationPage>(
		await apiFetch(`/api/ai/conversations?${params.toString()}`),
		'History API'
	);
};

export const getConversations = async (): Promise<StoredConversationSummary[]> =>
	(await getConversationPage()).conversations;

export const getConversation = async (id: string): Promise<StoredConversation> =>
	parseJsonResponse<StoredConversation>(
		await apiFetch(`/api/ai/conversations/${id}`),
		'History API'
	);

export const saveConversation = async (
	conversation: StoredConversation
): Promise<StoredConversation> => {
	const saved = await parseJsonResponse<StoredConversation>(
		await apiFetch(`/api/ai/conversations/${conversation.id}`, {
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
	const saved = await parseJsonResponse<StoredConversation>(
		await apiFetch(`/api/ai/conversations/${id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ title: title.trim().slice(0, 120) })
		}),
		'History API'
	);
	window.dispatchEvent(new Event(HISTORY_CHANGED_EVENT));
	window.dispatchEvent(
		new CustomEvent(RENAME_CHAT_EVENT, { detail: { id: saved.id, title: saved.title } })
	);
	return saved;
};

export const deleteConversation = async (id: string): Promise<StoredConversation> => {
	const deleted = await parseJsonResponse<StoredConversation>(
		await apiFetch(`/api/ai/conversations/${id}`, { method: 'DELETE' }),
		'History API'
	);
	window.dispatchEvent(new Event(HISTORY_CHANGED_EVENT));
	return deleted;
};

export const restoreConversation = async (id: string): Promise<StoredConversation> => {
	const restored = await parseJsonResponse<StoredConversation>(
		await apiFetch(`/api/ai/conversations/${id}/restore`, { method: 'POST' }),
		'History API'
	);
	window.dispatchEvent(new Event(HISTORY_CHANGED_EVENT));
	return restored;
};

export const createConversationId = (): string =>
	`${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
