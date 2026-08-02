import {
	deleteConversation,
	consumeDailyRequest,
	getAccountPreferences,
	getDailyUsage,
	getConversation,
	listConversationPage,
	purgeConversation,
	purgeAccountPreferences,
	purgeDailyUsage,
	recordTokenUsage,
	renameConversation,
	restoreConversation,
	saveAccountPreferences,
	saveConversation
} from '../src/history.js';

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ownerA = `__selftest_a_${suffix}`;
const ownerB = `__selftest_b_${suffix}`;
const firstId = `history-test-a-${suffix}`;
const secondId = `history-test-b-${suffix}`;

try {
	await saveConversation(ownerA, {
		id: firstId,
		title: 'First conversation',
		model: 'local',
		messages: [{ id: 1, role: 'user', text: 'hello' }]
	});
	await saveConversation(ownerA, {
		id: secondId,
		title: 'Second conversation',
		model: 'local',
		messages: []
	});
	await saveConversation(ownerB, {
		id: firstId,
		title: 'Other owner conversation',
		model: 'local',
		messages: []
	});

	const saved = await getConversation(ownerA, firstId);
	if (!saved || saved.title !== 'First conversation' || saved.messageCount !== 1) {
		throw new Error('Unable to read the saved conversation metadata');
	}

	const renamed = await renameConversation(ownerA, firstId, 'Renamed conversation');
	if (!renamed || renamed.title !== 'Renamed conversation') {
		throw new Error('Unable to rename the conversation');
	}
	if ((await getConversation(ownerB, firstId))?.title !== 'Other owner conversation') {
		throw new Error('Rename crossed the owner boundary');
	}

	const firstPage = await listConversationPage(ownerA, { limit: 1 });
	if (firstPage.conversations.length !== 1 || !firstPage.nextCursor) {
		throw new Error('Conversation pagination did not produce a cursor');
	}
	if ('messages' in firstPage.conversations[0]) {
		throw new Error('Conversation list leaked full message bodies');
	}
	const secondPage = await listConversationPage(ownerA, {
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
		await listConversationPage(ownerA, { cursor: 'invalid-cursor' });
	} catch (error) {
		if (!error.message.includes('cursor')) throw error;
		invalidCursorRejected = true;
	}
	if (!invalidCursorRejected) throw new Error('Invalid cursor was accepted');
	const searchResult = await listConversationPage(ownerA, { query: 'Renamed' });
	if (searchResult.conversations.length !== 1 || searchResult.conversations[0].id !== firstId) {
		throw new Error('Owner-scoped conversation search failed');
	}
	if ((await listConversationPage(ownerA, { query: 'Other owner' })).conversations.length !== 0) {
		throw new Error('Conversation search crossed the owner boundary');
	}

	const deleted = await deleteConversation(ownerA, firstId);
	if (!deleted?.deletedAt || (await getConversation(ownerA, firstId))) {
		throw new Error('Conversation soft delete failed');
	}
	if (!(await getConversation(ownerB, firstId))) {
		throw new Error('Delete crossed the owner boundary');
	}
	if ((await listConversationPage(ownerA)).conversations.some(({ id }) => id === firstId)) {
		throw new Error('Deleted conversation remains visible in history');
	}

	const restored = await restoreConversation(ownerA, firstId);
	if (!restored || restored.deletedAt !== null || !(await getConversation(ownerA, firstId))) {
		throw new Error('Conversation restore failed');
	}

	const usageDate = new Date().toISOString().slice(0, 10);
	if ((await consumeDailyRequest(ownerA, usageDate, 2)) !== 1) {
		throw new Error('Daily quota did not store the first request');
	}
	if ((await consumeDailyRequest(ownerA, usageDate, 2)) !== 2) {
		throw new Error('Daily quota did not increment atomically');
	}
	if ((await consumeDailyRequest(ownerA, usageDate, 2)) !== null) {
		throw new Error('Daily quota limit was not enforced');
	}
	await recordTokenUsage(ownerA, usageDate, 120, 30);
	await recordTokenUsage(ownerA, usageDate, 20, 5);
	const tokenUsage = await getDailyUsage(ownerA, usageDate);
	if (
		tokenUsage.requestCount !== 2 ||
		tokenUsage.inputTokens !== 140 ||
		tokenUsage.outputTokens !== 35 ||
		tokenUsage.totalTokens !== 175
	) {
		throw new Error('Daily token usage was not accumulated per owner');
	}
	await saveAccountPreferences(ownerA, { preferredModel: 'allowed-model' });
	if ((await getAccountPreferences(ownerA))?.preferredModel !== 'allowed-model') {
		throw new Error('Owner-scoped AI preferences were not persisted');
	}
	if (await getAccountPreferences(ownerB)) {
		throw new Error('AI preferences crossed the owner boundary');
	}

	console.log(
		`history_backend=${process.env.AI_DATABASE_URL ? 'postgresql' : 'sqlite'} owner_isolation=ok pagination=ok search=ok summary_privacy=ok soft_delete=ok restore=ok daily_quota=ok token_usage=ok preferences=ok`
	);
} finally {
	await purgeConversation(ownerA, firstId);
	await purgeConversation(ownerA, secondId);
	await purgeConversation(ownerB, firstId);
	await purgeDailyUsage(ownerA);
	await purgeAccountPreferences(ownerA);
	await purgeAccountPreferences(ownerB);
}
