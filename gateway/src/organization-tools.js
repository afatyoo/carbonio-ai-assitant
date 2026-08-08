import { createFolder, createTag, folderAction, listFolders, listTags, tagAction } from './mailbox.js';
import { registerTool, TOOL_RISK } from './tool-registry.js';

const id = { type: 'string', minLength: 1, maxLength: 100 };
const name = { type: 'string', minLength: 1, maxLength: 300 };
const preview = (kind, input) => ({ kind, ...input });

registerTool(
	{
		name: 'list_folders',
		description: 'List the authenticated user folder hierarchy.',
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			properties: {
				view: { type: 'string', enum: ['', 'message', 'appointment', 'contact', 'task'] }
			}
		},
		permission: 'mail.read',
		risk: TOOL_RISK.READ,
		confirmation: 'none',
		maxResultBytes: 64_000
	},
	(input, context) => listFolders({ cookie: context.cookie, ...input })
);

registerTool(
	{
		name: 'create_folder',
		description: 'Create one user folder after explicit confirmation.',
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			required: ['name', 'parentId'],
			properties: {
				name,
				parentId: id,
				view: { type: 'string', enum: ['message', 'appointment', 'contact', 'task'] }
			}
		},
		permission: 'mail.write',
		risk: TOOL_RISK.WRITE,
		confirmation: 'required',
		preview: (input) => preview('folder_create', input)
	},
	(input, context) => createFolder({ cookie: context.cookie, ...input })
);

for (const definition of [
	{
		name: 'rename_folder',
		operation: 'rename',
		required: ['id', 'name', 'currentName'],
		properties: { id, name, currentName: name },
		kind: 'folder_rename',
		risk: TOOL_RISK.WRITE
	},
	{
		name: 'move_folder',
		operation: 'move',
		required: ['id', 'name', 'parentId', 'parentName'],
		properties: { id, name, parentId: id, parentName: name },
		kind: 'folder_move',
		risk: TOOL_RISK.WRITE
	},
	{
		name: 'delete_folder',
		operation: 'trash',
		required: ['id', 'name'],
		properties: { id, name },
		kind: 'folder_trash',
		risk: TOOL_RISK.DESTRUCTIVE
	}
]) {
	registerTool(
		{
			name: definition.name,
			description: `${definition.operation} one exact user folder after explicit confirmation.`,
			inputSchema: {
				type: 'object',
				additionalProperties: false,
				required: definition.required,
				properties: definition.properties
			},
			permission: 'mail.write',
			risk: definition.risk,
			confirmation: 'required',
			preview: (input) => preview(definition.kind, input)
		},
		(input, context) =>
			folderAction({ cookie: context.cookie, operation: definition.operation, ...input })
	);
}

registerTool(
	{
		name: 'empty_trash',
		description: 'Permanently empty the standard Trash folder after strong confirmation.',
		inputSchema: { type: 'object', additionalProperties: false, properties: {} },
		permission: 'mail.write',
		risk: TOOL_RISK.DESTRUCTIVE,
		confirmation: 'required',
		preview: () => ({ kind: 'empty_trash', folderId: '3', permanent: true })
	},
	(_input, context) => folderAction({ cookie: context.cookie, id: '3', operation: 'empty' })
);

registerTool(
	{
		name: 'list_tags',
		description: 'List tags owned by the authenticated user.',
		inputSchema: { type: 'object', additionalProperties: false, properties: {} },
		permission: 'mail.read',
		risk: TOOL_RISK.READ,
		confirmation: 'none'
	},
	(_input, context) => listTags({ cookie: context.cookie })
);

registerTool(
	{
		name: 'create_tag',
		description: 'Create one user tag after explicit confirmation.',
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			required: ['name'],
			properties: { name, rgb: { type: 'string', maxLength: 7 } }
		},
		permission: 'mail.write',
		risk: TOOL_RISK.WRITE,
		confirmation: 'required',
		validate: ({ rgb = '' }) => {
			if (rgb && !/^#[0-9a-f]{6}$/i.test(rgb)) throw new Error('Tag RGB must use #rrggbb');
		},
		preview: (input) => preview('tag_create', input)
	},
	(input, context) => createTag({ cookie: context.cookie, ...input })
);

for (const definition of [
	{ name: 'rename_tag', operation: 'rename', risk: TOOL_RISK.WRITE, kind: 'tag_rename', rename: true },
	{ name: 'delete_tag', operation: 'delete', risk: TOOL_RISK.DESTRUCTIVE, kind: 'tag_delete' }
]) {
	registerTool(
		{
			name: definition.name,
			description: `${definition.operation} one exact user tag after explicit confirmation.`,
			inputSchema: {
				type: 'object',
				additionalProperties: false,
				required: definition.rename ? ['id', 'name', 'currentName'] : ['id', 'name'],
				properties: { id, name, currentName: name }
			},
			permission: 'mail.write',
			risk: definition.risk,
			confirmation: 'required',
			preview: (input) => preview(definition.kind, input)
		},
		(input, context) =>
			tagAction({ cookie: context.cookie, operation: definition.operation, ...input })
	);
}
