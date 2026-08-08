const TOOL_RISK = Object.freeze({
	READ: 'READ',
	DRAFT: 'DRAFT',
	WRITE: 'WRITE',
	DESTRUCTIVE: 'DESTRUCTIVE'
});

export const CAPABILITY_STATUS = Object.freeze({
	ACTIVE: 'active',
	PLANNED: 'planned',
	COMPATIBILITY_GATED: 'compatibility_gated',
	EXCLUDED: 'excluded'
});

const active = (name, domain, risk, permission, api) =>
	Object.freeze({ name, domain, risk, permission, api: Object.freeze(api), status: CAPABILITY_STATUS.ACTIVE });
const planned = (name, domain, risk, permission, api) =>
	Object.freeze({ name, domain, risk, permission, api: Object.freeze(api), status: CAPABILITY_STATUS.PLANNED });
const gated = (name, domain, risk, permission, api) =>
	Object.freeze({
		name,
		domain,
		risk,
		permission,
		api: Object.freeze(api),
		status: CAPABILITY_STATUS.COMPATIBILITY_GATED
	});

export const CARBONIO_USER_CAPABILITIES = Object.freeze([
	active('search_emails', 'mail', TOOL_RISK.READ, 'mail.read', ['Search']),
	active('list_unread_emails', 'mail', TOOL_RISK.READ, 'mail.read', ['Search']),
	active('get_email', 'mail', TOOL_RISK.READ, 'mail.read', ['GetMsg']),
	active('get_email_thread', 'mail', TOOL_RISK.READ, 'mail.read', ['GetConv']),
	active('list_attachments', 'mail', TOOL_RISK.READ, 'mail.read', ['GetMsg']),
	active('create_email_draft', 'mail', TOOL_RISK.DRAFT, 'mail.draft', ['SaveDraft']),
	active('update_email_draft', 'mail', TOOL_RISK.DRAFT, 'mail.draft', ['SaveDraft']),
	active('forward_as_draft', 'mail', TOOL_RISK.DRAFT, 'mail.draft', ['SaveDraft']),
	active('send_email', 'mail', TOOL_RISK.WRITE, 'mail.write', ['SendMsg']),
	active('mark_as_read', 'mail', TOOL_RISK.WRITE, 'mail.write', ['GetMsg', 'MsgAction']),
	active('mark_as_unread', 'mail', TOOL_RISK.WRITE, 'mail.write', ['GetMsg', 'MsgAction']),
	active('flag_email', 'mail', TOOL_RISK.WRITE, 'mail.write', ['GetMsg', 'MsgAction']),
	active('unflag_email', 'mail', TOOL_RISK.WRITE, 'mail.write', ['GetMsg', 'MsgAction']),
	active('mark_as_spam', 'mail', TOOL_RISK.WRITE, 'mail.write', ['GetMsg', 'MsgAction']),
	active('mark_as_not_spam', 'mail', TOOL_RISK.WRITE, 'mail.write', ['GetMsg', 'MsgAction']),
	active('add_tag', 'mail', TOOL_RISK.WRITE, 'mail.write', ['GetMsg', 'MsgAction']),
	active('remove_tag', 'mail', TOOL_RISK.WRITE, 'mail.write', ['GetMsg', 'MsgAction']),
	active('move_email', 'mail', TOOL_RISK.WRITE, 'mail.write', ['GetMsg', 'MsgAction']),
	active('delete_email', 'mail', TOOL_RISK.DESTRUCTIVE, 'mail.write', ['GetMsg', 'MsgAction']),
	active('get_appointment', 'calendar', TOOL_RISK.READ, 'calendar.read', ['GetAppointment']),
	active('search_contacts', 'contacts', TOOL_RISK.READ, 'calendar.read', ['AutoComplete']),
	active('resolve_attendees', 'contacts', TOOL_RISK.READ, 'calendar.read', ['AutoComplete']),
	active('search_appointments', 'calendar', TOOL_RISK.READ, 'calendar.read', ['Search']),
	active('check_free_busy', 'calendar', TOOL_RISK.READ, 'calendar.read', ['GetFreeBusy']),
	active('propose_meeting_slots', 'calendar', TOOL_RISK.READ, 'calendar.read', ['GetFreeBusy']),
	active('create_appointment', 'calendar', TOOL_RISK.WRITE, 'calendar.write', ['CreateAppointment']),
	active('create_calendar_draft', 'calendar', TOOL_RISK.DRAFT, 'calendar.write', ['SetAppointment']),
	active('update_appointment', 'calendar', TOOL_RISK.DRAFT, 'calendar.write', ['GetAppointment', 'ModifyAppointment']),
	active('send_meeting_invitation', 'calendar', TOOL_RISK.WRITE, 'calendar.write', ['GetAppointment', 'ModifyAppointment']),
	active('cancel_appointment', 'calendar', TOOL_RISK.DESTRUCTIVE, 'calendar.write', ['GetAppointment', 'CancelAppointment']),

	active('list_folders', 'mail', TOOL_RISK.READ, 'mail.read', ['GetFolder']),
	active('create_folder', 'mail', TOOL_RISK.WRITE, 'mail.write', ['CreateFolder']),
	active('rename_folder', 'mail', TOOL_RISK.WRITE, 'mail.write', ['GetFolder', 'FolderAction']),
	active('move_folder', 'mail', TOOL_RISK.WRITE, 'mail.write', ['GetFolder', 'FolderAction']),
	active('delete_folder', 'mail', TOOL_RISK.DESTRUCTIVE, 'mail.write', ['GetFolder', 'FolderAction']),
	active('empty_trash', 'mail', TOOL_RISK.DESTRUCTIVE, 'mail.write', ['FolderAction']),
	active('list_tags', 'mail', TOOL_RISK.READ, 'mail.read', ['GetTag']),
	active('create_tag', 'mail', TOOL_RISK.WRITE, 'mail.write', ['CreateTag']),
	active('rename_tag', 'mail', TOOL_RISK.WRITE, 'mail.write', ['GetTag', 'TagAction']),
	active('delete_tag', 'mail', TOOL_RISK.DESTRUCTIVE, 'mail.write', ['GetTag', 'TagAction']),
	planned('archive_email', 'mail', TOOL_RISK.WRITE, 'mail.write', ['GetMsg', 'MsgAction']),
	planned('restore_email', 'mail', TOOL_RISK.WRITE, 'mail.write', ['GetMsg', 'MsgAction']),
	planned('remove_attachment', 'mail', TOOL_RISK.DESTRUCTIVE, 'mail.write', ['GetMsg', 'RemoveAttachments']),

	gated('search_tasks', 'tasks', TOOL_RISK.READ, 'tasks.read', ['Search', 'GetTask', 'GetAppointment']),
	gated('get_task', 'tasks', TOOL_RISK.READ, 'tasks.read', ['GetTask', 'GetAppointment']),
	planned('create_task', 'tasks', TOOL_RISK.WRITE, 'tasks.write', ['CreateAppointment']),
	planned('update_task', 'tasks', TOOL_RISK.WRITE, 'tasks.write', ['GetTask', 'ModifyAppointment']),
	planned('complete_task', 'tasks', TOOL_RISK.WRITE, 'tasks.write', ['GetTask', 'ItemAction']),
	planned('reopen_task', 'tasks', TOOL_RISK.WRITE, 'tasks.write', ['GetTask', 'ItemAction']),
	planned('delete_task', 'tasks', TOOL_RISK.DESTRUCTIVE, 'tasks.write', ['GetTask', 'ItemAction']),

	planned('list_contacts', 'contacts', TOOL_RISK.READ, 'contacts.read', ['GetContacts']),
	planned('get_contact', 'contacts', TOOL_RISK.READ, 'contacts.read', ['GetContacts']),
	planned('create_contact', 'contacts', TOOL_RISK.WRITE, 'contacts.write', ['CreateContact']),
	planned('update_contact', 'contacts', TOOL_RISK.WRITE, 'contacts.write', ['GetContacts', 'ModifyContact']),
	planned('move_contact', 'contacts', TOOL_RISK.WRITE, 'contacts.write', ['GetContacts', 'ContactAction']),
	planned('tag_contact', 'contacts', TOOL_RISK.WRITE, 'contacts.write', ['GetContacts', 'ContactAction']),
	planned('delete_contact', 'contacts', TOOL_RISK.DESTRUCTIVE, 'contacts.write', ['GetContacts', 'ContactAction']),

	planned('list_calendars', 'calendar', TOOL_RISK.READ, 'calendar.read', ['GetFolder']),
	planned('respond_to_invitation', 'calendar', TOOL_RISK.WRITE, 'calendar.write', ['GetAppointment', 'SendInviteReply']),
	planned('forward_appointment', 'calendar', TOOL_RISK.WRITE, 'calendar.write', ['GetAppointment', 'ForwardAppointment']),
	planned('dismiss_alarm', 'calendar', TOOL_RISK.WRITE, 'calendar.write', ['DismissCalendarItemAlarm']),
	planned('snooze_alarm', 'calendar', TOOL_RISK.WRITE, 'calendar.write', ['SnoozeCalendarItemAlarm']),
	planned('create_calendar', 'calendar', TOOL_RISK.WRITE, 'calendar.write', ['CreateFolder']),
	planned('rename_calendar', 'calendar', TOOL_RISK.WRITE, 'calendar.write', ['GetFolder', 'FolderAction']),
	planned('delete_calendar', 'calendar', TOOL_RISK.DESTRUCTIVE, 'calendar.write', ['GetFolder', 'DeleteCalendar']),

	planned('list_shares', 'sharing', TOOL_RISK.READ, 'sharing.read', ['GetShareInfo']),
	planned('grant_share', 'sharing', TOOL_RISK.WRITE, 'sharing.write', ['CheckRights', 'GrantPermission']),
	planned('revoke_share', 'sharing', TOOL_RISK.DESTRUCTIVE, 'sharing.write', ['CheckRights', 'RevokePermission']),
	planned('send_share_notification', 'sharing', TOOL_RISK.WRITE, 'sharing.write', ['SendShareNotification']),
	planned('list_filter_rules', 'preferences', TOOL_RISK.READ, 'preferences.read', ['GetFilterRules']),
	planned('create_filter_rule', 'preferences', TOOL_RISK.WRITE, 'preferences.write', ['GetFilterRules', 'ModifyFilterRules']),
	planned('update_filter_rule', 'preferences', TOOL_RISK.WRITE, 'preferences.write', ['GetFilterRules', 'ModifyFilterRules']),
	planned('delete_filter_rule', 'preferences', TOOL_RISK.DESTRUCTIVE, 'preferences.write', ['GetFilterRules', 'ModifyFilterRules']),
	planned('list_identities', 'preferences', TOOL_RISK.READ, 'preferences.read', ['GetIdentities']),
	planned('create_identity', 'preferences', TOOL_RISK.WRITE, 'preferences.write', ['CreateIdentity']),
	planned('update_identity', 'preferences', TOOL_RISK.WRITE, 'preferences.write', ['GetIdentities', 'ModifyIdentity']),
	planned('delete_identity', 'preferences', TOOL_RISK.DESTRUCTIVE, 'preferences.write', ['GetIdentities', 'DeleteIdentity']),
	planned('list_signatures', 'preferences', TOOL_RISK.READ, 'preferences.read', ['GetSignatures']),
	planned('create_signature', 'preferences', TOOL_RISK.WRITE, 'preferences.write', ['CreateSignature']),
	planned('update_signature', 'preferences', TOOL_RISK.WRITE, 'preferences.write', ['GetSignatures', 'ModifySignature']),
	planned('delete_signature', 'preferences', TOOL_RISK.DESTRUCTIVE, 'preferences.write', ['GetSignatures', 'DeleteSignature']),

	gated('search_files', 'files', TOOL_RISK.READ, 'files.read', ['CopyToFiles']),
	gated('search_chats', 'chats', TOOL_RISK.READ, 'chats.read', ['server compatibility probe'])
]);

export const EXCLUDED_CARBONIO_CAPABILITIES = Object.freeze([
	Object.freeze({ domain: 'authentication', reason: 'The assistant never changes passwords, resets accounts, or manages sessions.' }),
	Object.freeze({ domain: 'administration', reason: 'Domain, COS, server, queue, backup, and account administration are outside the user-only boundary.' }),
	Object.freeze({ domain: 'impersonation', reason: 'The assistant uses only the currently authenticated Carbonio session.' }),
	Object.freeze({ domain: 'internal-storage', reason: 'The assistant never accesses Carbonio internal databases or mailbox storage directly.' })
]);

const forbiddenName = /(?:^|_)(?:admin|auth|password|impersonate|impersonation|server|cos|domain|mailbox_db|session)(?:_|$)/i;
const forbiddenPermission = /^(?:admin|server|domain|cos|auth|impersonation)(?:\.|$)/i;

export const assertUserScopedToolDefinition = (definition) => {
	if (forbiddenName.test(String(definition?.name ?? ''))) {
		throw new Error(`Administrative or authentication tool is forbidden: ${definition?.name ?? ''}`);
	}
	if (forbiddenPermission.test(String(definition?.permission ?? ''))) {
		throw new Error(`Administrative tool permission is forbidden: ${definition?.permission ?? ''}`);
	}
};

export const listCapabilitiesByStatus = (status) =>
	CARBONIO_USER_CAPABILITIES.filter((capability) => capability.status === status);
