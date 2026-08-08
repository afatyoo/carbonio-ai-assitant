import { assertUserScopedToolDefinition } from './carbonio-capabilities.js';

export const TOOL_RISK = Object.freeze({
	READ: 'READ',
	DRAFT: 'DRAFT',
	WRITE: 'WRITE',
	DESTRUCTIVE: 'DESTRUCTIVE'
});

const risks = new Set(Object.values(TOOL_RISK));
const registry = new Map();

const assertSchema = (schema) => {
	if (!schema || schema.type !== 'object' || typeof schema.properties !== 'object') {
		throw new Error('Tool input schema must be an object schema');
	}
};

export const registerTool = (definition, handler) => {
	if (!/^[a-z][a-z0-9_]{2,63}$/.test(definition.name)) {
		throw new Error(`Invalid tool name: ${definition.name}`);
	}
	if (registry.has(definition.name)) throw new Error(`Duplicate tool: ${definition.name}`);
	if (!risks.has(definition.risk)) throw new Error(`Invalid tool risk: ${definition.risk}`);
	if (typeof definition.permission !== 'string' || !definition.permission) {
		throw new Error(`Tool permission is required: ${definition.name}`);
	}
	assertUserScopedToolDefinition(definition);
	assertSchema(definition.inputSchema);
	if (typeof handler !== 'function') throw new Error(`Tool handler is required: ${definition.name}`);
	const normalized = Object.freeze({
		...definition,
		timeoutMs: Math.min(Math.max(Number(definition.timeoutMs) || 20_000, 1_000), 60_000),
		maxResultBytes: Math.min(
			Math.max(Number(definition.maxResultBytes) || 32_000, 1_000),
			128_000
		),
		confirmation:
			definition.confirmation ??
			([TOOL_RISK.WRITE, TOOL_RISK.DESTRUCTIVE].includes(definition.risk)
				? 'required'
				: 'none'),
		audit: definition.audit ?? 'required'
	});
	registry.set(normalized.name, { definition: normalized, handler });
	return normalized;
};

export const getRegisteredTool = (name) => registry.get(name) ?? null;

export const listToolDefinitions = () =>
	[...registry.values()].map(({ definition }) => ({ ...definition }));

const validateValue = (value, schema, path) => {
	if (schema.type === 'string') {
		if (typeof value !== 'string') throw new Error(`${path} must be a string`);
		if (schema.minLength && value.length < schema.minLength) {
			throw new Error(`${path} is too short`);
		}
		if (schema.maxLength && value.length > schema.maxLength) {
			throw new Error(`${path} exceeds ${schema.maxLength} characters`);
		}
		if (schema.enum && !schema.enum.includes(value)) throw new Error(`${path} is not allowed`);
		return;
	}
	if (schema.type === 'integer') {
		if (!Number.isInteger(value)) throw new Error(`${path} must be an integer`);
		if (schema.minimum !== undefined && value < schema.minimum) {
			throw new Error(`${path} is below the minimum`);
		}
		if (schema.maximum !== undefined && value > schema.maximum) {
			throw new Error(`${path} exceeds the maximum`);
		}
		return;
	}
	if (schema.type === 'boolean' && typeof value !== 'boolean') {
		throw new Error(`${path} must be a boolean`);
	}
};

export const validateToolInput = (definition, input) => {
	if (!input || typeof input !== 'object' || Array.isArray(input)) {
		throw new Error('Tool input must be an object');
	}
	const schema = definition.inputSchema;
	const required = new Set(schema.required ?? []);
	for (const key of required) {
		if (input[key] === undefined || input[key] === null) throw new Error(`${key} is required`);
	}
	if (schema.additionalProperties === false) {
		for (const key of Object.keys(input)) {
			if (!Object.hasOwn(schema.properties, key)) throw new Error(`Unknown input field: ${key}`);
		}
	}
	for (const [key, value] of Object.entries(input)) {
		if (value === undefined) continue;
		const propertySchema = schema.properties[key];
		if (propertySchema) validateValue(value, propertySchema, key);
	}
	return input;
};
