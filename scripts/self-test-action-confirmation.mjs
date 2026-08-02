import assert from 'node:assert/strict';

import {
	getActionResultMessage,
	getConfirmationPresentation
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

console.log('confirmation_copy=ok action_results=ok');
