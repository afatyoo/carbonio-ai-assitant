import { getRequestContext } from './request-context.js';

const normalizeValue = (value) => {
	if (value instanceof Error) return { name: value.name, message: value.message };
	return value;
};

export const logEvent = (level, event, fields = {}) => {
	const { requestId } = getRequestContext();
	const record = {
		timestamp: new Date().toISOString(),
		level,
		event,
		...(requestId ? { request_id: requestId } : {}),
		...Object.fromEntries(
			Object.entries(fields)
				.filter(([, value]) => value !== undefined)
				.map(([key, value]) => [key, normalizeValue(value)])
		)
	};
	const output = JSON.stringify(record);
	if (level === 'error') console.error(output);
	else if (level === 'warn') console.warn(output);
	else console.log(output);
};
