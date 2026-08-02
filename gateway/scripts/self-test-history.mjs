import {
	deleteConversation,
	getConversation,
	listConversationPage,
	purgeConversation,
	renameConversation,
	restoreConversation,
	saveConversation
} from '../src/history.js';

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ownerA = `__selftest_a_${suffix}`;
const ownerB = `__selftest_b_${suffix}`;
const firstId = `history-test-a-${suffix}`;
const secondId = `history-test-b-${suffix}`;

try {
	saveConversation(ownerA, {
		id: firstId,
		title: 'First conversation',
		model: 'local',
		messages: [{ id: 1, role: 'user', text: 'hello' }]
	});
	saveConversation(ownerA, {
		id: secondId,
		title: 'Second conversation',
		model: 'local',
		messages: []
	});
	saveConversation(ownerB, {
		id: firstId,
		title: 'Other owner conversation',
		model: 'local',
		messages: []
	});

	const saved = getConversation(ownerA, firstId);
	if (!saved || saved.title !== 'First conversation' || saved.messageCount !== 1) {
		throw new Error('Unable to read the saved conversation metadata');
	}

	const renamed = renameConversation(ownerA, firstId, 'Renamed conversation');
	if (!renamed || renamed.title !== 'Renamed conversation') {
		throw new Error('Unable to rename the conversation');
	}
	if (getConversation(ownerB, firstId)?.title !== 'Other owner conversation') {
		throw new Error('Rename crossed the owner boundary');
	}

	const firstPage = listConversationPage(ownerA, { limit: 1 });
	if (firstPage.conversations.length !== 1 || !firstPage.nextCursor) {
		throw new Error('Conversation pagination did not produce a cursor');
	}
	if ('messages' in firstPage.conversations[0]) {
		throw new Error('Conversation list leaked full message bodies');
	}
	const secondPage = listConversationPage(ownerA, {
		limit: 1,
		cursor: firstPage.nextCursor
	});
	if (
		secondPage.conversations.length !== 1 ||
		secondPage.conversations[0].id === firstPage.conversations[0].id
	) {
		throw new Error('Conversation cursor returned a duplicate or empty page');
	}
	let invalidCursorRejected = false;
	try {
		listConversationPage(ownerA, { cursor: 'invalid-cursor' });
	} catch (error) {
		if (!error.message.includes('cursor')) throw error;
		invalidCursorRejected = true;
	}
	if (!invalidCursorRejected) throw new Error('Invalid cursor was accepted');
	const searchResult = listConversationPage(ownerA, { query: 'Renamed' });
	if (searchResult.conversations.length !== 1 || searchResult.conversations[0].id !== firstId) {
		throw new Error('Owner-scoped conversation search failed');
	}
	if (listConversationPage(ownerA, { query: 'Other owner' }).conversations.length !== 0) {
		throw new Error('Conversation search crossed the owner boundary');
	}

	const deleted = deleteConversation(ownerA, firstId);
	if (!deleted?.deletedAt || getConversation(ownerA, firstId)) {
		throw new Error('Conversation soft delete failed');
	}
	if (!getConversation(ownerB, firstId)) {
		throw new Error('Delete crossed the owner boundary');
	}
	if (listConversationPage(ownerA).conversations.some(({ id }) => id === firstId)) {
		throw new Error('Deleted conversation remains visible in history');
	}

	const restored = restoreConversation(ownerA, firstId);
	if (!restored || restored.deletedAt !== null || !getConversation(ownerA, firstId)) {
		throw new Error('Conversation restore failed');
	}

	console.log(
		'sqlite=ok owner_isolation=ok pagination=ok search=ok summary_privacy=ok soft_delete=ok restore=ok'
	);
} finally {
	purgeConversation(ownerA, firstId);
	purgeConversation(ownerA, secondId);
	purgeConversation(ownerB, firstId);
}
