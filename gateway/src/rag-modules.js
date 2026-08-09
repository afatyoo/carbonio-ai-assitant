export const RAG_MODULES = Object.freeze([
	'mail',
	'attachments',
	'calendar',
	'tasks',
	'contacts',
	'organization',
	'files',
	'chats'
]);

export const RAG_SOURCE_CAPABILITIES = Object.freeze({
	mail: { available: true, label: 'Mail and threads' },
	attachments: { available: true, label: 'Attachments (safe text and metadata)' },
	calendar: { available: true, label: 'Calendar' },
	tasks: { available: true, label: 'Tasks' },
	contacts: { available: true, label: 'Personal contacts' },
	organization: { available: true, adminOnly: true, label: 'Organization knowledge' },
	files: {
		available: false,
		label: 'Files and Docs',
		reason: 'Official user-scoped Files API compatibility probe has not passed on this server'
	},
	chats: {
		available: false,
		label: 'Chats and rooms',
		reason: 'Official user-scoped Chats API compatibility probe has not passed on this server'
	}
});

export const assertRagModule = (value) => {
	const module = String(value ?? '').trim().toLowerCase();
	if (!RAG_MODULES.includes(module)) {
		const error = new Error('Unsupported AI source module');
		error.statusCode = 400;
		throw error;
	}
	return module;
};

export const assertAvailableRagModule = (value) => {
	const module = assertRagModule(value);
	if (RAG_SOURCE_CAPABILITIES[module].adminOnly) {
		const error = new Error('Organization knowledge is managed by Carbonio administrators');
		error.statusCode = 403;
		throw error;
	}
	if (!RAG_SOURCE_CAPABILITIES[module].available) {
		const error = new Error(RAG_SOURCE_CAPABILITIES[module].reason);
		error.statusCode = 409;
		throw error;
	}
	return module;
};
