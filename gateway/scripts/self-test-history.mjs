import {
	deleteConversation,
	getConversation,
	saveConversation
} from '../src/history.js';

const owner = '__selftest__';
const id = 'gateway-persistence-test';

try {
	saveConversation(owner, {
		id,
		title: 'test',
		model: 'local',
		messages: []
	});
	const conversation = getConversation(owner, id);
	if (!conversation || conversation.title !== 'test') {
		throw new Error('Unable to read the saved test conversation');
	}
	console.log('sqlite=ok');
} finally {
	deleteConversation(owner, id);
}
