import {
	completeAuditEntry,
	consumeConfirmation,
	createAuditEntry,
	createConfirmation,
	getIdempotentResult,
	saveIdempotentResult
} from './tool-audit.js';
import { logEvent } from './logger.js';
import { getRegisteredTool, validateToolInput } from './tool-registry.js';

const withTimeout = async (promise, timeoutMs, toolName) => {
	let timeout;
	try {
		return await Promise.race([
			promise,
			new Promise((_, reject) => {
				timeout = setTimeout(
					() => reject(new Error(`Tool ${toolName} timed out after ${timeoutMs} ms`)),
					timeoutMs
				);
			})
		]);
	} finally {
		clearTimeout(timeout);
	}
};

const countResult = (result) => {
	if (Array.isArray(result)) return result.length;
	if (Array.isArray(result?.items)) return result.items.length;
	return result == null ? 0 : 1;
};

export const executeTool = async ({ name, input, context }) => {
	const registered = getRegisteredTool(name);
	if (!registered) throw new Error(`Unknown tool: ${name}`);
	const { definition, handler } = registered;
	validateToolInput(definition, input);
	definition.validate?.(input);
	if (!context?.ownerId || !context?.permissions?.includes(definition.permission)) {
		throw new Error(`Permission denied for tool: ${name}`);
	}
	const audit = createAuditEntry({
		ownerId: context.ownerId,
		toolName: name,
		risk: definition.risk,
		input
	});
	const startedAt = Date.now();
	try {
		const cached = getIdempotentResult({
			ownerId: context.ownerId,
			toolName: name,
			idempotencyKey: context.idempotencyKey,
			inputHash: audit.inputHash
		});
		if (cached !== null) {
			completeAuditEntry(audit.id, {
				status: 'idempotent_replay',
				resultCount: countResult(cached),
				resultReference: definition.resultReference?.(cached) ?? null
			});
			return { status: 'completed', tool: name, result: cached, replayed: true };
		}
		if (definition.confirmation === 'required') {
			if (!context.confirmationToken) {
				const confirmation = createConfirmation({
					ownerId: context.ownerId,
					toolName: name,
					inputHash: audit.inputHash
				});
				completeAuditEntry(audit.id, { status: 'confirmation_required' });
				return {
					status: 'confirmation_required',
					tool: name,
					confirmation: {
						...confirmation,
						preview: definition.preview?.(input) ?? { tool: name }
					}
				};
			}
			if (
				!consumeConfirmation({
					token: context.confirmationToken,
					ownerId: context.ownerId,
					toolName: name,
					inputHash: audit.inputHash
				})
			) {
				throw new Error('Invalid, expired, or already used confirmation token');
			}
		}
		const result = await withTimeout(
			Promise.resolve(handler(input, context)),
			definition.timeoutMs,
			name
		);
		const serialized = JSON.stringify(result);
		if (Buffer.byteLength(serialized) > definition.maxResultBytes) {
			throw new Error(`Tool ${name} result exceeds ${definition.maxResultBytes} bytes`);
		}
		saveIdempotentResult({
			ownerId: context.ownerId,
			toolName: name,
			idempotencyKey: context.idempotencyKey,
			inputHash: audit.inputHash,
			result
		});
		const resultCount = countResult(result);
		completeAuditEntry(audit.id, {
			status: 'completed',
			resultCount,
			resultReference: definition.resultReference?.(result) ?? null
		});
		logEvent('info', 'tool_completed', {
			tool: name,
			risk: definition.risk,
			result_count: resultCount,
			duration_ms: Date.now() - startedAt
		});
		return { status: 'completed', tool: name, result };
	} catch (error) {
		completeAuditEntry(audit.id, { status: 'failed', errorCode: error.message.slice(0, 120) });
		logEvent('error', 'tool_failed', {
			tool: name,
			risk: definition.risk,
			duration_ms: Date.now() - startedAt,
			error
		});
		throw error;
	}
};
