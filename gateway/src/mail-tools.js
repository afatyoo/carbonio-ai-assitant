import {
	createEmailDraft,
	getEmail,
	getEmailAttachments,
	getEmailThread,
	searchEmails
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
