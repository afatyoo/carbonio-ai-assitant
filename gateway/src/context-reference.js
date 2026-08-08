const allowedModules = new Set(['calendar', 'mail']);
const allowedObjectTypes = new Set(['appointment', 'conversation', 'message']);
const allowedActions = new Set([
	'action_items',
	'ask',
	'draft_reply',
	'meeting_prep',
	'summarize',
	'translate'
]);
const identifierPattern = /^[A-Za-z0-9:_.-]{1,200}$/;

const invalidContext = (message) => {
	const error = new Error(message);
	error.statusCode = 400;
	return error;
};

const optionalIdentifier = (value, field) => {
	if (value === undefined || value === null || value === '') return undefined;
	if (typeof value !== 'string' || !identifierPattern.test(value.trim())) {
		throw invalidContext(`Invalid context ${field}`);
	}
	return value.trim();
};

export const normalizeContextReference = (value) => {
	if (value === undefined || value === null) return null;
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw invalidContext('Invalid context reference');
	}
	if (!allowedModules.has(value.module)) throw invalidContext('Unsupported context module');
	if (!allowedObjectTypes.has(value.objectType)) throw invalidContext('Unsupported context object type');
	if (value.module === 'mail' && !['conversation', 'message'].includes(value.objectType)) {
		throw invalidContext('Context object type does not match module');
	}
	if (value.module === 'calendar' && value.objectType !== 'appointment') {
		throw invalidContext('Context object type does not match module');
	}
	if (!allowedActions.has(value.action)) throw invalidContext('Unsupported context action');
	const objectId = optionalIdentifier(value.objectId, 'objectId');
	if (!objectId) throw invalidContext('Context objectId is required');
	const selection = value.selection === undefined
		? undefined
		: Array.isArray(value.selection)
			? value.selection.slice(0, 20).map((item) => {
					const normalized = optionalIdentifier(item, 'selection');
					if (!normalized) throw invalidContext('Invalid context selection');
					return normalized;
				})
			: (() => {
					throw invalidContext('Invalid context selection');
				})();
	return {
		module: value.module,
		objectType: value.objectType,
		objectId,
		action: value.action,
		revision: optionalIdentifier(value.revision, 'revision'),
		folderId: optionalIdentifier(value.folderId, 'folderId'),
		selection
	};
};
