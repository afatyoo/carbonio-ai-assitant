const backend = process.env.AI_DATABASE_URL
	? await import('./history-postgres.js')
	: await import('./history-sqlite.js');

export const historyBackend = backend.historyBackend ?? 'sqlite';
export const listConversationPage = (...args) => Promise.resolve(backend.listConversationPage(...args));
export const listConversations = (...args) => Promise.resolve(backend.listConversations(...args));
export const getConversation = (...args) => Promise.resolve(backend.getConversation(...args));
export const saveConversation = (...args) => Promise.resolve(backend.saveConversation(...args));
export const renameConversation = (...args) => Promise.resolve(backend.renameConversation(...args));
export const deleteConversation = (...args) => Promise.resolve(backend.deleteConversation(...args));
export const restoreConversation = (...args) => Promise.resolve(backend.restoreConversation(...args));
export const purgeConversation = (...args) => Promise.resolve(backend.purgeConversation(...args));
export const importConversation = (...args) => {
	if (!backend.importConversation) throw new Error('History import requires PostgreSQL');
	return Promise.resolve(backend.importConversation(...args));
};
export const consumeDailyRequest = (...args) => Promise.resolve(backend.consumeDailyRequest(...args));
export const purgeDailyUsage = (...args) => Promise.resolve(backend.purgeDailyUsage(...args));
export const closeHistoryDatabase = () => Promise.resolve(backend.closeHistoryDatabase?.());
