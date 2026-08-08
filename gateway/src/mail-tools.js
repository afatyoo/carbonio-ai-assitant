import {
	createEmailDraft,
	getEmail,
	getEmailAttachments,
	getEmailThread,
	messageAction,
	searchEmails,
	sendEmail
} from './mailbox.js';
import { registerTool, TOOL_RISK } from './tool-registry.js';

const searchSchema = {
	type: 'object',
	additionalProperties: false,
	required: ['query', 'limit'],
	properties: {
		query: { type: 'string', minLength: 1, maxLength: 500 },
		limit: { type: 'integer', minimum: 1, maximum: 20 }
	}
};

registerTool(
	{
		name: 'search_emails',
		description: 'Search the authenticated user mailbox and return bounded metadata.',
		inputSchema: searchSchema,
		permission: 'mail.read',
		risk: TOOL_RISK.READ,
		confirmation: 'none',
		timeoutMs: 25_000,
		maxResultBytes: 32_000
	},
	(input, context) => searchEmails({ cookie: context.cookie, ...input })
);

const emailContentProperties = {
	to: { type: 'string', minLength: 3, maxLength: 2_000 },
	cc: { type: 'string', maxLength: 2_000 },
	bcc: { type: 'string', maxLength: 2_000 },
	subject: { type: 'string', minLength: 1, maxLength: 998 },
	body: { type: 'string', minLength: 1, maxLength: 50_000 },
	originalId: { type: 'string', maxLength: 100 },
	replyType: { type: 'string', enum: ['r', 'w', ''] }
};

const emailPreview = (kind, input) => ({
	kind,
	to: input.to,
	cc: input.cc ?? '',
	bcc: input.bcc ?? '',
	subject: input.subject,
	body: input.body
});

registerTool(
	{
		name: 'update_email_draft',
		description: 'Update one existing Carbonio draft after explicit confirmation.',
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			required: ['draftId', 'to', 'subject', 'body'],
			properties: {
				draftId: { type: 'string', minLength: 1, maxLength: 100 },
				...emailContentProperties
			}
		},
		permission: 'mail.draft',
		risk: TOOL_RISK.DRAFT,
		confirmation: 'required',
		timeoutMs: 25_000,
		maxResultBytes: 8_000,
		resultReference: (result) => String(result.id ?? '').slice(0, 200),
		preview: (input) => ({
			...emailPreview('email_draft_update', input),
			draftId: input.draftId
		})
	},
	(input, context) =>
		createEmailDraft({ cookie: context.cookie, from: context.accountName, ...input })
);

registerTool(
	{
		name: 'forward_as_draft',
		description: 'Save a forward of one Carbonio message as a draft without sending it.',
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			required: ['originalId', 'to', 'subject', 'body'],
			properties: emailContentProperties
		},
		permission: 'mail.draft',
		risk: TOOL_RISK.DRAFT,
		confirmation: 'required',
		timeoutMs: 25_000,
		maxResultBytes: 8_000,
		resultReference: (result) => String(result.id ?? '').slice(0, 200),
		preview: (input) => ({
			...emailPreview('email_forward_draft', input),
			originalId: input.originalId
		})
	},
	(input, context) =>
		createEmailDraft({
			cookie: context.cookie,
			from: context.accountName,
			...input,
			replyType: 'w'
		})
);

registerTool(
	{
		name: 'send_email',
		description: 'Send one plain-text Carbonio email only after explicit user confirmation.',
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			required: ['to', 'subject', 'body'],
			properties: {
				draftId: { type: 'string', maxLength: 100 },
				...emailContentProperties
			}
		},
		permission: 'mail.write',
		risk: TOOL_RISK.WRITE,
		confirmation: 'required',
		timeoutMs: 30_000,
		maxResultBytes: 8_000,
		resultReference: (result) => String(result.id ?? '').slice(0, 200),
		preview: (input) => emailPreview('email_send', input)
	},
	(input, context) => sendEmail({ cookie: context.cookie, from: context.accountName, ...input })
);

const messageTargetProperties = {
	id: { type: 'string', minLength: 1, maxLength: 100 },
	subject: { type: 'string', maxLength: 998 },
	sender: { type: 'string', maxLength: 320 },
	date: { type: 'string', maxLength: 100 }
};

const messageTargetPreview = (kind, input) => ({
	kind,
	id: input.id,
	subject: input.subject ?? '',
	sender: input.sender ?? '',
	date: input.date ?? ''
});

registerTool(
	{
		name: 'mark_as_read',
		description: 'Mark one Carbonio email as read after explicit user confirmation.',
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			required: ['id'],
			properties: messageTargetProperties
		},
		permission: 'mail.write',
		risk: TOOL_RISK.WRITE,
		confirmation: 'required',
		timeoutMs: 25_000,
		maxResultBytes: 8_000,
		resultReference: (result) => String(result.id ?? '').slice(0, 200),
		preview: (input) => messageTargetPreview('mark_as_read', input)
	},
	(input, context) =>
		messageAction({ cookie: context.cookie, id: input.id, operation: 'read' })
);

const registerMessageToggle = ({ name, description, operation, previewKind }) =>
	registerTool(
		{
			name,
			description,
			inputSchema: {
				type: 'object',
				additionalProperties: false,
				required: ['id'],
				properties: messageTargetProperties
			},
			permission: 'mail.write',
			risk: TOOL_RISK.WRITE,
			confirmation: 'required',
			timeoutMs: 25_000,
			maxResultBytes: 8_000,
			resultReference: (result) => String(result.id ?? '').slice(0, 200),
			preview: (input) => messageTargetPreview(previewKind, input)
		},
		(input, context) => messageAction({ cookie: context.cookie, id: input.id, operation })
	);

registerMessageToggle({
	name: 'mark_as_unread',
	description: 'Mark one Carbonio email as unread after explicit user confirmation.',
	operation: '!read',
	previewKind: 'mark_as_unread'
});
registerMessageToggle({
	name: 'flag_email',
	description: 'Flag one Carbonio email after explicit user confirmation.',
	operation: 'flag',
	previewKind: 'flag_email'
});
registerMessageToggle({
	name: 'unflag_email',
	description: 'Remove the flag from one Carbonio email after explicit user confirmation.',
	operation: '!flag',
	previewKind: 'unflag_email'
});
registerMessageToggle({
	name: 'mark_as_spam',
	description: 'Move one Carbonio email through the server spam action after explicit confirmation.',
	operation: 'spam',
	previewKind: 'mark_as_spam'
});
registerMessageToggle({
	name: 'mark_as_not_spam',
	description: 'Remove the spam state from one Carbonio email after explicit confirmation.',
	operation: '!spam',
	previewKind: 'mark_as_not_spam'
});

registerTool(
	{
		name: 'add_tag',
		description: 'Add one existing Carbonio tag to one email after explicit confirmation.',
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			required: ['id', 'tagName'],
			properties: {
				...messageTargetProperties,
				tagName: { type: 'string', minLength: 1, maxLength: 128 }
			}
		},
		permission: 'mail.write',
		risk: TOOL_RISK.WRITE,
		confirmation: 'required',
		timeoutMs: 25_000,
		maxResultBytes: 8_000,
		resultReference: (result) => String(result.id ?? '').slice(0, 200),
		preview: (input) => ({
			...messageTargetPreview('add_tag', input),
			tagName: input.tagName
		})
	},
	(input, context) =>
		messageAction({
			cookie: context.cookie,
			id: input.id,
			operation: 'tag',
			tagName: input.tagName
		})
);

registerTool(
	{
		name: 'remove_tag',
		description: 'Remove one existing Carbonio tag from one email after explicit confirmation.',
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			required: ['id', 'tagName'],
			properties: {
				...messageTargetProperties,
				tagName: { type: 'string', minLength: 1, maxLength: 128 }
			}
		},
		permission: 'mail.write',
		risk: TOOL_RISK.WRITE,
		confirmation: 'required',
		timeoutMs: 25_000,
		maxResultBytes: 8_000,
		resultReference: (result) => String(result.id ?? '').slice(0, 200),
		preview: (input) => ({
			...messageTargetPreview('remove_tag', input),
			tagName: input.tagName
		})
	},
	(input, context) =>
		messageAction({
			cookie: context.cookie,
			id: input.id,
			operation: '!tag',
			tagName: input.tagName
		})
);

registerTool(
	{
		name: 'move_email',
		description: 'Move one Carbonio email to a specific folder after explicit confirmation.',
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			required: ['id', 'folderId'],
			properties: {
				...messageTargetProperties,
				folderId: { type: 'string', minLength: 1, maxLength: 100 },
				folderName: { type: 'string', maxLength: 300 }
			}
		},
		permission: 'mail.write',
		risk: TOOL_RISK.WRITE,
		confirmation: 'required',
		timeoutMs: 25_000,
		maxResultBytes: 8_000,
		resultReference: (result) => String(result.id ?? '').slice(0, 200),
		preview: (input) => ({
			...messageTargetPreview('move_email', input),
			folderId: input.folderId,
			folderName: input.folderName ?? ''
		})
	},
	(input, context) =>
		messageAction({
			cookie: context.cookie,
			id: input.id,
			operation: 'move',
			folderId: input.folderId
		})
);

registerTool(
	{
		name: 'delete_email',
		description: 'Permanently delete one Carbonio email after strong explicit confirmation.',
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			required: ['id'],
			properties: messageTargetProperties
		},
		permission: 'mail.write',
		risk: TOOL_RISK.DESTRUCTIVE,
		confirmation: 'required',
		timeoutMs: 25_000,
		maxResultBytes: 8_000,
		resultReference: (result) => String(result.id ?? '').slice(0, 200),
		preview: (input) => ({
			...messageTargetPreview('delete_email', input),
			permanent: true
		})
	},
	(input, context) =>
		messageAction({ cookie: context.cookie, id: input.id, operation: 'delete' })
);

registerTool(
	{
		name: 'get_email',
		description: 'Read one authenticated user email without marking it as read.',
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			required: ['id'],
			properties: {
				id: { type: 'string', minLength: 1, maxLength: 100 },
				maxBodyLength: { type: 'integer', minimum: 1_000, maximum: 24_000 }
			}
		},
		permission: 'mail.read',
		risk: TOOL_RISK.READ,
		confirmation: 'none',
		timeoutMs: 25_000,
		maxResultBytes: 48_000
	},
	(input, context) => getEmail({ cookie: context.cookie, ...input })
);

registerTool(
	{
		name: 'list_attachments',
		description: 'List bounded attachment metadata without downloading attachment content.',
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			required: ['id'],
			properties: {
				id: { type: 'string', minLength: 1, maxLength: 100 }
			}
		},
		permission: 'mail.read',
		risk: TOOL_RISK.READ,
		confirmation: 'none',
		timeoutMs: 25_000,
		maxResultBytes: 32_000
	},
	(input, context) => getEmailAttachments({ cookie: context.cookie, ...input })
);

registerTool(
	{
		name: 'get_email_thread',
		description: 'Read a bounded authenticated user email conversation without marking it read.',
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			required: ['conversationId'],
			properties: {
				conversationId: { type: 'string', minLength: 1, maxLength: 100 },
				maxBodyLength: { type: 'integer', minimum: 1_000, maximum: 12_000 }
			}
		},
		permission: 'mail.read',
		risk: TOOL_RISK.READ,
		confirmation: 'none',
		timeoutMs: 25_000,
		maxResultBytes: 128_000
	},
	(input, context) => getEmailThread({ cookie: context.cookie, ...input })
);

registerTool(
	{
		name: 'create_email_draft',
		description: 'Save a plain-text email draft in the authenticated user Drafts folder.',
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			required: ['to', 'subject', 'body'],
			properties: {
				to: { type: 'string', minLength: 3, maxLength: 2_000 },
				cc: { type: 'string', maxLength: 2_000 },
				bcc: { type: 'string', maxLength: 2_000 },
				subject: { type: 'string', minLength: 1, maxLength: 998 },
				body: { type: 'string', minLength: 1, maxLength: 50_000 },
				originalId: { type: 'string', maxLength: 100 },
				replyType: { type: 'string', enum: ['r', 'w', ''] }
			}
		},
		permission: 'mail.draft',
		risk: TOOL_RISK.DRAFT,
		confirmation: 'required',
		timeoutMs: 25_000,
		maxResultBytes: 8_000,
		resultReference: (result) => String(result.id ?? '').slice(0, 200),
		preview: (input) => ({
			kind: 'email_draft',
			to: input.to,
			cc: input.cc ?? '',
			bcc: input.bcc ?? '',
			subject: input.subject,
			body: input.body
		})
	},
	(input, context) =>
		createEmailDraft({ cookie: context.cookie, from: context.accountName, ...input })
);

registerTool(
	{
		name: 'list_unread_emails',
		description: 'List unread email metadata for the authenticated user.',
		inputSchema: searchSchema,
		permission: 'mail.read',
		risk: TOOL_RISK.READ,
		confirmation: 'none',
		timeoutMs: 25_000,
		maxResultBytes: 32_000
	},
	(input, context) => searchEmails({ cookie: context.cookie, ...input })
);
