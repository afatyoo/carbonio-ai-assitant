type ConfirmationPresentation = {
	ariaKey: string;
	ariaFallback: string;
	titleKey: string;
	titleFallback: string;
	buttonKey: string;
	buttonFallback: string;
};

type ActionResultMessage = {
	key: string;
	fallback: string;
	values: { id: string };
};

export type ConfirmationPreviewField = {
	key: string;
	labelKey: string;
	labelFallback: string;
	value: string;
};

const PREVIEW_FIELDS: Array<[string, string, string]> = [
	['id', 'chat.item_id', 'Item ID'],
	['messageId', 'chat.message_id', 'Message ID'],
	['appointmentId', 'chat.appointment_id', 'Appointment ID'],
	['inviteId', 'chat.invite_id', 'Invite ID'],
	['revision', 'chat.revision', 'Revision'],
	['name', 'chat.name', 'Name'],
	['currentName', 'chat.current_name', 'Current name'],
	['displayName', 'chat.display_name', 'Display name'],
	['parentName', 'chat.parent', 'Parent'],
	['parentId', 'chat.parent_id', 'Parent ID'],
	['folderName', 'chat.destination', 'Destination'],
	['folderId', 'chat.folder_id', 'Folder ID'],
	['tagName', 'chat.tag', 'Tag'],
	['filename', 'chat.filename', 'Filename'],
	['part', 'chat.attachment_part', 'Attachment part'],
	['response', 'chat.response', 'Response'],
	['recipients', 'chat.recipients', 'Recipients'],
	['grantee', 'chat.grantee', 'Shared with'],
	['granteeType', 'chat.grantee_type', 'Grantee type'],
	['permission', 'chat.permission', 'Permission'],
	['action', 'chat.action', 'Action'],
	['at', 'chat.time', 'Time'],
	['contentType', 'chat.content_type', 'Content type'],
	['attributesJson', 'chat.contact_fields', 'Contact fields'],
	['ruleJson', 'chat.filter_definition', 'Filter definition'],
	['content', 'chat.signature_content', 'Signature content'],
	['sender', 'chat.sender', 'Sender'],
	['date', 'chat.date', 'Date']
];

export const getGenericConfirmationFields = (
	preview: Record<string, unknown>
): ConfirmationPreviewField[] =>
	PREVIEW_FIELDS.flatMap(([key, labelKey, labelFallback]) => {
		const raw = preview[key];
		if (raw === undefined || raw === null || raw === '') return [];
		const value = typeof raw === 'string' ? raw : String(raw);
		return [{ key, labelKey, labelFallback, value }];
	});

const PRESENTATIONS: Record<string, ConfirmationPresentation> = {
	create_email_draft: {
		ariaKey: 'chat.draft_preview',
		ariaFallback: 'Email draft preview',
		titleKey: 'chat.confirm_draft_title',
		titleFallback: 'Confirm saving this draft',
		buttonKey: 'chat.save_draft',
		buttonFallback: 'Save to Drafts'
	},
	update_email_draft: {
		ariaKey: 'chat.draft_preview',
		ariaFallback: 'Email draft preview',
		titleKey: 'chat.confirm_update_draft_title',
		titleFallback: 'Confirm updating this draft',
		buttonKey: 'chat.update_draft',
		buttonFallback: 'Update draft'
	},
	forward_as_draft: {
		ariaKey: 'chat.draft_preview',
		ariaFallback: 'Email draft preview',
		titleKey: 'chat.confirm_forward_draft_title',
		titleFallback: 'Confirm saving this forward draft',
		buttonKey: 'chat.save_draft',
		buttonFallback: 'Save to Drafts'
	},
	send_email: {
		ariaKey: 'chat.email_preview',
		ariaFallback: 'Email action preview',
		titleKey: 'chat.confirm_send_title',
		titleFallback: 'Confirm sending this email',
		buttonKey: 'chat.send_email',
		buttonFallback: 'Send email'
	},
	mark_as_read: {
		ariaKey: 'chat.email_preview',
		ariaFallback: 'Email action preview',
		titleKey: 'chat.confirm_mark_read_title',
		titleFallback: 'Confirm marking this email as read',
		buttonKey: 'chat.mark_as_read',
		buttonFallback: 'Mark as read'
	},
	add_tag: {
		ariaKey: 'chat.email_preview',
		ariaFallback: 'Email action preview',
		titleKey: 'chat.confirm_add_tag_title',
		titleFallback: 'Confirm adding this tag',
		buttonKey: 'chat.add_tag',
		buttonFallback: 'Add tag'
	},
	move_email: {
		ariaKey: 'chat.email_preview',
		ariaFallback: 'Email action preview',
		titleKey: 'chat.confirm_move_title',
		titleFallback: 'Confirm moving this email',
		buttonKey: 'chat.move_email',
		buttonFallback: 'Move email'
	},
	delete_email: {
		ariaKey: 'chat.destructive_preview',
		ariaFallback: 'Destructive action preview',
		titleKey: 'chat.confirm_delete_email_title',
		titleFallback: 'Permanently delete this email?',
		buttonKey: 'chat.delete_email',
		buttonFallback: 'Delete permanently'
	},
	create_appointment: {
		ariaKey: 'chat.appointment_preview',
		ariaFallback: 'Appointment preview',
		titleKey: 'chat.confirm_appointment_title',
		titleFallback: 'Confirm creating this appointment',
		buttonKey: 'chat.create_appointment',
		buttonFallback: 'Create appointment'
	},
	create_calendar_draft: {
		ariaKey: 'chat.appointment_preview',
		ariaFallback: 'Appointment preview',
		titleKey: 'chat.confirm_calendar_draft_title',
		titleFallback: 'Confirm saving this calendar draft',
		buttonKey: 'chat.save_calendar_draft',
		buttonFallback: 'Save calendar draft'
	},
	update_appointment: {
		ariaKey: 'chat.appointment_preview',
		ariaFallback: 'Appointment preview',
		titleKey: 'chat.confirm_update_appointment_title',
		titleFallback: 'Confirm staging these appointment changes',
		buttonKey: 'chat.update_appointment',
		buttonFallback: 'Stage update'
	},
	send_meeting_invitation: {
		ariaKey: 'chat.appointment_preview',
		ariaFallback: 'Appointment preview',
		titleKey: 'chat.confirm_invitation_title',
		titleFallback: 'Confirm updating this appointment and sending invitations',
		buttonKey: 'chat.send_invitation',
		buttonFallback: 'Send invitations'
	},
	cancel_appointment: {
		ariaKey: 'chat.destructive_preview',
		ariaFallback: 'Destructive action preview',
		titleKey: 'chat.confirm_cancel_appointment_title',
		titleFallback: 'Cancel this appointment?',
		buttonKey: 'chat.cancel_appointment',
		buttonFallback: 'Cancel appointment'
	}
};

export const getConfirmationPresentation = (
	tool: string,
	_kind = ''
): ConfirmationPresentation =>
	PRESENTATIONS[tool] ?? {
		ariaKey: 'chat.action_preview',
		ariaFallback: 'Action preview',
		titleKey: 'chat.confirm_action_title',
		titleFallback: 'Confirm this action',
		buttonKey: 'chat.confirm_action',
		buttonFallback: 'Confirm'
	};

const RESULT_MESSAGES: Record<string, [string, string]> = {
	create_email_draft: [
		'chat.draft_saved',
		'Draft saved to Carbonio Drafts (ID: {{id}}). It has not been sent.'
	],
	update_email_draft: ['chat.draft_updated', 'Draft updated in Carbonio (ID: {{id}}).'],
	forward_as_draft: [
		'chat.forward_draft_saved',
		'Forward draft saved in Carbonio (ID: {{id}}). It has not been sent.'
	],
	send_email: ['chat.email_sent', 'Email sent through Carbonio (ID: {{id}}).'],
	mark_as_read: ['chat.email_marked_read', 'Email marked as read (ID: {{id}}).'],
	add_tag: ['chat.tag_added', 'Tag added to email (ID: {{id}}).'],
	move_email: ['chat.email_moved', 'Email moved in Carbonio (ID: {{id}}).'],
	delete_email: ['chat.email_deleted', 'Email permanently deleted (ID: {{id}}).'],
	create_calendar_draft: [
		'chat.calendar_draft_saved',
		'Calendar draft saved (ID: {{id}}). No invitations were sent.'
	],
	update_appointment: [
		'chat.appointment_update_staged',
		'Appointment changes staged (ID: {{id}}). No invitations were sent.'
	],
	send_meeting_invitation: [
		'chat.invitation_sent',
		'Appointment updated and invitations sent (ID: {{id}}).'
	],
	cancel_appointment: ['chat.appointment_cancelled', 'Appointment cancelled (ID: {{id}}).']
};

export const getActionResultMessage = (tool: string, id: string): ActionResultMessage => {
	const [key, fallback] = RESULT_MESSAGES[tool] ?? [
		'chat.action_completed',
		'Action completed in Carbonio (ID: {{id}}).'
	];
	return { key, fallback, values: { id } };
};
