import assert from 'node:assert/strict';

import {
	getActionResultMessage,
	getConfirmationPresentation,
	getGenericConfirmationFields
} from '../src/utils/action-confirmation.ts';

assert.deepEqual(getConfirmationPresentation('send_email', 'email_send'), {
	ariaKey: 'chat.email_preview',
	ariaFallback: 'Email action preview',
	titleKey: 'chat.confirm_send_title',
	titleFallback: 'Confirm sending this email',
	buttonKey: 'chat.send_email',
	buttonFallback: 'Send email'
});
assert.equal(
	getConfirmationPresentation('delete_email', 'delete_email').buttonKey,
	'chat.delete_email'
);
assert.equal(
	getConfirmationPresentation('cancel_appointment', 'appointment_cancel').titleKey,
	'chat.confirm_cancel_appointment_title'
);
assert.equal(getActionResultMessage('mark_as_read', '12').key, 'chat.email_marked_read');
assert.equal(getActionResultMessage('send_meeting_invitation', '44').key, 'chat.invitation_sent');
assert.deepEqual(
	getGenericConfirmationFields({
		kind: 'calendar_create',
		name: 'AI-UAT-DO-NOT-SAVE',
		parentId: '1',
		parentName: 'USER_ROOT'
	}),
	[
		{ key: 'name', labelKey: 'chat.name', labelFallback: 'Name', value: 'AI-UAT-DO-NOT-SAVE' },
		{ key: 'parentName', labelKey: 'chat.parent', labelFallback: 'Parent', value: 'USER_ROOT' },
		{ key: 'parentId', labelKey: 'chat.parent_id', labelFallback: 'Parent ID', value: '1' }
	]
);

console.log('confirmation_copy=ok action_results=ok');
