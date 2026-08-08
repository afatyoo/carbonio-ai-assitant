import { createFolder, folderAction, getEmail, listFolders, messageAction } from './mailbox.js';
import {
	contactAction,
	createContact,
	createFilterRule,
	createIdentity,
	createSignature,
	deleteCalendar,
	deleteFilterRule,
	deleteIdentity,
	deleteSignature,
	forwardAppointment,
	getContact,
	grantShare,
	listCalendars,
	listContacts,
	listFilterRules,
	listIdentities,
	listShares,
	listSignatures,
	removeAttachment,
	respondToInvitation,
	revokeShare,
	sendShareNotification,
	updateAlarm,
	updateContact,
	updateFilterRule,
	updateIdentity,
	updateSignature
} from './user-services.js';
import { registerTool, TOOL_RISK } from './tool-registry.js';

const id = { type: 'string', minLength: 1, maxLength: 100 };
const name = { type: 'string', minLength: 1, maxLength: 300 };
const json = { type: 'string', minLength: 2, maxLength: 40_000 };
const emailList = { type: 'string', minLength: 3, maxLength: 5_000 };
const objectSchema = (properties, required = []) => ({ type: 'object', additionalProperties: false, required, properties });
const preview = (kind) => (input) => ({ kind, ...input });

const register = (definition, handler) => registerTool({ timeoutMs: 30_000, maxResultBytes: 64_000, ...definition }, handler);

register({
	name: 'archive_email', description: 'Move one exact message to a selected Archive folder.',
	inputSchema: objectSchema({ id, revision: id, folderId: id, folderName: name }, ['id', 'revision', 'folderId', 'folderName']),
	permission: 'mail.write', risk: TOOL_RISK.WRITE, confirmation: 'required', preview: preview('email_archive')
}, async (input, context) => {
	const [message, folders] = await Promise.all([getEmail({ cookie: context.cookie, id: input.id }), listFolders({ cookie: context.cookie })]);
	if (message.revision !== input.revision) throw new Error('Message changed since preview; refresh and confirm again');
	if (!folders.some((folder) => folder.id === input.folderId && folder.name === input.folderName)) throw new Error('Archive folder changed since preview; refresh and confirm again');
	return messageAction({ cookie: context.cookie, id: input.id, operation: 'move', folderId: input.folderId });
});

register({
	name: 'restore_email', description: 'Restore one exact message from Trash or Spam to a selected folder.',
	inputSchema: objectSchema({ id, revision: id, folderId: id, folderName: name }, ['id', 'revision', 'folderId', 'folderName']),
	permission: 'mail.write', risk: TOOL_RISK.WRITE, confirmation: 'required', preview: preview('email_restore')
}, async (input, context) => {
	const [message, folders] = await Promise.all([getEmail({ cookie: context.cookie, id: input.id }), listFolders({ cookie: context.cookie })]);
	if (message.revision !== input.revision) throw new Error('Message changed since preview; refresh and confirm again');
	if (!folders.some((folder) => folder.id === input.folderId && folder.name === input.folderName)) throw new Error('Destination folder changed since preview; refresh and confirm again');
	return messageAction({ cookie: context.cookie, id: input.id, operation: 'move', folderId: input.folderId });
});

register({
	name: 'remove_attachment', description: 'Permanently remove one exact attachment from a message.',
	inputSchema: objectSchema({ messageId: id, revision: id, part: id, filename: { type: 'string', maxLength: 500 } }, ['messageId', 'revision', 'part', 'filename']),
	permission: 'mail.write', risk: TOOL_RISK.DESTRUCTIVE, confirmation: 'required', preview: preview('attachment_remove')
}, async (input, context) => {
	const message = await getEmail({ cookie: context.cookie, id: input.messageId });
	if (message.revision !== input.revision) throw new Error('Message changed since preview; refresh and confirm again');
	if (!message.attachments.some((attachment) => attachment.part === input.part && attachment.filename === input.filename)) throw new Error('Attachment changed since preview; refresh and confirm again');
	return removeAttachment({ cookie: context.cookie, ...input });
});

register({ name: 'list_contacts', description: 'List bounded personal contacts.', inputSchema: objectSchema({ folderId: id, limit: { type: 'integer', minimum: 1, maximum: 500 } }), permission: 'contacts.read', risk: TOOL_RISK.READ, confirmation: 'none' }, (input, context) => listContacts({ cookie: context.cookie, ...input }));
register({ name: 'get_contact', description: 'Read one exact personal contact.', inputSchema: objectSchema({ id }, ['id']), permission: 'contacts.read', risk: TOOL_RISK.READ, confirmation: 'none' }, (input, context) => getContact({ cookie: context.cookie, ...input }));
register({ name: 'create_contact', description: 'Create one personal contact.', inputSchema: objectSchema({ folderId: id, folderName: name, attributesJson: json }, ['folderId', 'folderName', 'attributesJson']), permission: 'contacts.write', risk: TOOL_RISK.WRITE, confirmation: 'required', preview: preview('contact_create') }, async (input, context) => {
	const folders = await listFolders({ cookie: context.cookie, view: 'contact' });
	if (!folders.some((folder) => folder.id === input.folderId && folder.name === input.folderName)) throw new Error('Contact folder changed since preview; refresh and confirm again');
	return createContact({ cookie: context.cookie, ...input });
});
register({ name: 'update_contact', description: 'Replace one exact personal contact after revision revalidation.', inputSchema: objectSchema({ id, revision: { type: 'integer', minimum: 0 }, attributesJson: json }, ['id', 'revision', 'attributesJson']), permission: 'contacts.write', risk: TOOL_RISK.WRITE, confirmation: 'required', preview: preview('contact_update') }, (input, context) => updateContact({ cookie: context.cookie, ...input }));

for (const definition of [
	{ name: 'move_contact', operation: 'move', properties: { id, revision: { type: 'integer', minimum: 0 }, folderId: id, folderName: name }, required: ['id', 'revision', 'folderId', 'folderName'], risk: TOOL_RISK.WRITE },
	{ name: 'tag_contact', operation: 'tag', properties: { id, revision: { type: 'integer', minimum: 0 }, tagName: name }, required: ['id', 'revision', 'tagName'], risk: TOOL_RISK.WRITE },
	{ name: 'delete_contact', operation: 'trash', properties: { id, revision: { type: 'integer', minimum: 0 }, displayName: name }, required: ['id', 'revision', 'displayName'], risk: TOOL_RISK.DESTRUCTIVE }
]) register({ name: definition.name, description: `${definition.operation} one exact personal contact.`, inputSchema: objectSchema(definition.properties, definition.required), permission: 'contacts.write', risk: definition.risk, confirmation: 'required', preview: preview(definition.name) }, async (input, context) => {
	if (definition.operation === 'move') {
		const folders = await listFolders({ cookie: context.cookie, view: 'contact' });
		if (!folders.some((folder) => folder.id === input.folderId && folder.name === input.folderName)) throw new Error('Contact folder changed since preview; refresh and confirm again');
	}
	return contactAction({ cookie: context.cookie, operation: definition.operation, ...input });
});

register({ name: 'list_calendars', description: 'List calendars owned or mounted by the authenticated user.', inputSchema: objectSchema({}), permission: 'calendar.read', risk: TOOL_RISK.READ, confirmation: 'none' }, (_input, context) => listCalendars({ cookie: context.cookie }));
register({ name: 'create_calendar', description: 'Create one user calendar.', inputSchema: objectSchema({ name, parentId: id, parentName: name }, ['name', 'parentId', 'parentName']), permission: 'calendar.write', risk: TOOL_RISK.WRITE, confirmation: 'required', preview: preview('calendar_create') }, async (input, context) => {
	const folders = await listFolders({ cookie: context.cookie });
	if (!folders.some((folder) => folder.id === input.parentId && folder.name === input.parentName)) throw new Error('Parent folder changed since preview; refresh and confirm again');
	return createFolder({ cookie: context.cookie, view: 'appointment', ...input });
});
register({ name: 'rename_calendar', description: 'Rename one exact user calendar.', inputSchema: objectSchema({ id, name, currentName: name }, ['id', 'name', 'currentName']), permission: 'calendar.write', risk: TOOL_RISK.WRITE, confirmation: 'required', preview: preview('calendar_rename') }, async (input, context) => {
	const calendars = await listCalendars({ cookie: context.cookie });
	if (!calendars.some((calendar) => calendar.id === input.id && calendar.name === input.currentName)) throw new Error('Calendar changed since preview; refresh and confirm again');
	return folderAction({ cookie: context.cookie, operation: 'rename', ...input });
});
register({ name: 'delete_calendar', description: 'Permanently delete one exact calendar.', inputSchema: objectSchema({ id, name }, ['id', 'name']), permission: 'calendar.write', risk: TOOL_RISK.DESTRUCTIVE, confirmation: 'required', preview: preview('calendar_delete') }, async (input, context) => {
	const calendars = await listCalendars({ cookie: context.cookie });
	if (!calendars.some((calendar) => calendar.id === input.id && calendar.name === input.name)) throw new Error('Calendar changed since preview; refresh and confirm again');
	return deleteCalendar({ cookie: context.cookie, ...input });
});
register({ name: 'respond_to_invitation', description: 'Accept, tentatively accept, or decline one invitation.', inputSchema: objectSchema({ appointmentId: id, inviteId: id, revision: { type: 'integer', minimum: 0 }, componentNum: { type: 'integer', minimum: 0, maximum: 10_000 }, response: { type: 'string', enum: ['accept', 'tentative', 'decline'] }, subject: name }, ['appointmentId', 'inviteId', 'revision', 'componentNum', 'response', 'subject']), permission: 'calendar.write', risk: TOOL_RISK.WRITE, confirmation: 'required', preview: preview('invitation_response') }, (input, context) => respondToInvitation({ cookie: context.cookie, ...input }));
register({ name: 'forward_appointment', description: 'Forward one appointment to selected recipients.', inputSchema: objectSchema({ appointmentId: id, revision: { type: 'integer', minimum: 0 }, recipients: emailList, subject: name, body: { type: 'string', maxLength: 20_000 } }, ['appointmentId', 'revision', 'recipients', 'subject']), permission: 'calendar.write', risk: TOOL_RISK.WRITE, confirmation: 'required', preview: preview('appointment_forward') }, (input, context) => forwardAppointment({ cookie: context.cookie, ...input }));
const alarmProperties = { appointmentId: id, revision: { type: 'integer', minimum: 0 }, subject: name, at: { type: 'string', minLength: 20, maxLength: 40 } };
register({ name: 'dismiss_alarm', description: 'Dismiss one appointment alarm.', inputSchema: objectSchema(alarmProperties, ['appointmentId', 'revision', 'subject', 'at']), permission: 'calendar.write', risk: TOOL_RISK.WRITE, confirmation: 'required', preview: preview('alarm_dismiss') }, (input, context) => updateAlarm({ cookie: context.cookie, operation: 'dismiss', ...input }));
register({ name: 'snooze_alarm', description: 'Snooze one appointment alarm until an exact timestamp.', inputSchema: objectSchema(alarmProperties, ['appointmentId', 'revision', 'subject', 'at']), permission: 'calendar.write', risk: TOOL_RISK.WRITE, confirmation: 'required', preview: preview('alarm_snooze') }, (input, context) => updateAlarm({ cookie: context.cookie, operation: 'snooze', ...input }));

register({ name: 'list_shares', description: 'List incoming shares and user folder ACL metadata.', inputSchema: objectSchema({}), permission: 'sharing.read', risk: TOOL_RISK.READ, confirmation: 'none' }, (_input, context) => listShares({ cookie: context.cookie }));
const withExactFolder = (handler) => async (input, context) => {
	const folders = await listFolders({ cookie: context.cookie });
	if (!folders.some((folder) => folder.id === input.folderId && folder.name === input.folderName)) throw new Error('Shared folder changed since preview; refresh and confirm again');
	return handler({ cookie: context.cookie, ...input });
};
register({ name: 'grant_share', description: 'Grant access to one exact user folder.', inputSchema: objectSchema({ folderId: id, folderName: name, granteeType: { type: 'string', enum: ['usr', 'grp', 'all', 'pub', 'email'] }, grantee: { type: 'string', maxLength: 320 }, permission: { type: 'string', minLength: 1, maxLength: 30 } }, ['folderId', 'folderName', 'granteeType', 'grantee', 'permission']), permission: 'sharing.write', risk: TOOL_RISK.WRITE, confirmation: 'required', validate: ({ permission }) => { if (!/^[rwidxap]+$/.test(permission)) throw new Error('Share permission contains unsupported rights'); }, preview: preview('share_grant') }, withExactFolder(grantShare));
register({ name: 'revoke_share', description: 'Revoke one exact grantee from one user folder.', inputSchema: objectSchema({ folderId: id, folderName: name, granteeId: id, grantee: { type: 'string', maxLength: 320 } }, ['folderId', 'folderName', 'granteeId', 'grantee']), permission: 'sharing.write', risk: TOOL_RISK.DESTRUCTIVE, confirmation: 'required', preview: preview('share_revoke') }, withExactFolder(revokeShare));
register({ name: 'send_share_notification', description: 'Send a share edit or revoke notification.', inputSchema: objectSchema({ folderId: id, folderName: name, recipients: emailList, action: { type: 'string', enum: ['edit', 'revoke'] } }, ['folderId', 'folderName', 'recipients', 'action']), permission: 'sharing.write', risk: TOOL_RISK.WRITE, confirmation: 'required', preview: preview('share_notification') }, withExactFolder(sendShareNotification));

register({ name: 'list_filter_rules', description: 'List personal incoming mail filter rules.', inputSchema: objectSchema({}), permission: 'preferences.read', risk: TOOL_RISK.READ, confirmation: 'none' }, (_input, context) => listFilterRules({ cookie: context.cookie }));
for (const definition of [
	{ name: 'create_filter_rule', handler: createFilterRule, required: ['name', 'ruleJson'], risk: TOOL_RISK.WRITE },
	{ name: 'update_filter_rule', handler: updateFilterRule, required: ['name', 'ruleJson'], risk: TOOL_RISK.WRITE },
	{ name: 'delete_filter_rule', handler: deleteFilterRule, required: ['name'], risk: TOOL_RISK.DESTRUCTIVE }
]) register({ name: definition.name, description: `${definition.name.replaceAll('_', ' ')} for the authenticated user.`, inputSchema: objectSchema({ name, ruleJson: json }, definition.required), permission: 'preferences.write', risk: definition.risk, confirmation: 'required', preview: preview(definition.name) }, (input, context) => definition.handler({ cookie: context.cookie, ...input }));

register({ name: 'list_identities', description: 'List personal sending identities.', inputSchema: objectSchema({}), permission: 'preferences.read', risk: TOOL_RISK.READ, confirmation: 'none' }, (_input, context) => listIdentities({ cookie: context.cookie }));
for (const definition of [
	{ name: 'create_identity', handler: createIdentity, properties: { name, attributesJson: json }, required: ['name', 'attributesJson'], risk: TOOL_RISK.WRITE },
	{ name: 'update_identity', handler: updateIdentity, properties: { id, name, attributesJson: json }, required: ['id', 'name', 'attributesJson'], risk: TOOL_RISK.WRITE },
	{ name: 'delete_identity', handler: deleteIdentity, properties: { id, name }, required: ['id', 'name'], risk: TOOL_RISK.DESTRUCTIVE }
]) register({ name: definition.name, description: `${definition.name.replaceAll('_', ' ')} for the authenticated user.`, inputSchema: objectSchema(definition.properties, definition.required), permission: 'preferences.write', risk: definition.risk, confirmation: 'required', preview: preview(definition.name) }, (input, context) => definition.handler({ cookie: context.cookie, ...input }));

register({ name: 'list_signatures', description: 'List personal signatures.', inputSchema: objectSchema({}), permission: 'preferences.read', risk: TOOL_RISK.READ, confirmation: 'none' }, (_input, context) => listSignatures({ cookie: context.cookie }));
for (const definition of [
	{ name: 'create_signature', handler: createSignature, properties: { name, content: { type: 'string', maxLength: 20_000 }, contentType: { type: 'string', enum: ['text/plain', 'text/html'] } }, required: ['name', 'content', 'contentType'], risk: TOOL_RISK.WRITE },
	{ name: 'update_signature', handler: updateSignature, properties: { id, currentName: name, name, content: { type: 'string', maxLength: 20_000 }, contentType: { type: 'string', enum: ['text/plain', 'text/html'] } }, required: ['id', 'currentName', 'name', 'content', 'contentType'], risk: TOOL_RISK.WRITE },
	{ name: 'delete_signature', handler: deleteSignature, properties: { id, name }, required: ['id', 'name'], risk: TOOL_RISK.DESTRUCTIVE }
]) register({ name: definition.name, description: `${definition.name.replaceAll('_', ' ')} for the authenticated user.`, inputSchema: objectSchema(definition.properties, definition.required), permission: 'preferences.write', risk: definition.risk, confirmation: 'required', preview: preview(definition.name) }, (input, context) => definition.handler({ cookie: context.cookie, ...input }));
