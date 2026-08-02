import { searchEmails } from './mailbox.js';
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
