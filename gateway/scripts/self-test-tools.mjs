import path from 'node:path';
import { randomUUID } from 'node:crypto';
import os from 'node:os';

process.env.AI_AUDIT_DB_PATH = path.join(os.tmpdir(), `carbonio-ai-tools-${randomUUID()}.sqlite`);

const { registerTool, TOOL_RISK } = await import('../src/tool-registry.js');
const { executeTool } = await import('../src/tool-runner.js');
const { listAuditEntries } = await import('../src/tool-audit.js');

const schema = {
	type: 'object',
	additionalProperties: false,
	required: ['value'],
	properties: { value: { type: 'string', minLength: 1, maxLength: 20 } }
};

registerTool(
	{
		name: 'test_read_tool',
		description: 'Read test',
		inputSchema: schema,
		permission: 'test.read',
		risk: TOOL_RISK.READ,
		timeoutMs: 1_000,
		maxResultBytes: 2_000
	},
	(input) => [{ value: input.value }]
);

let writeExecutions = 0;
registerTool(
	{
		name: 'test_write_tool',
		description: 'Write test',
		inputSchema: schema,
		permission: 'test.write',
		risk: TOOL_RISK.WRITE,
		timeoutMs: 1_000,
		maxResultBytes: 2_000,
		preview: (input) => ({ valueLength: input.value.length })
	},
	(input) => {
		writeExecutions += 1;
		return { saved: input.value, execution: writeExecutions };
	}
);

const read = await executeTool({
	name: 'test_read_tool',
	input: { value: 'ok' },
	context: { ownerId: 'owner-a', permissions: ['test.read'] }
});
if (read.result?.[0]?.value !== 'ok') throw new Error('Read tool result mismatch');

let validationRejected = false;
try {
	await executeTool({
		name: 'test_read_tool',
		input: { value: 'ok', unexpected: true },
		context: { ownerId: 'owner-a', permissions: ['test.read'] }
	});
} catch (error) {
	validationRejected = error.message.includes('Unknown input field');
}
if (!validationRejected) throw new Error('Schema validation did not reject unknown input');

const pending = await executeTool({
	name: 'test_write_tool',
	input: { value: 'save-me' },
	context: { ownerId: 'owner-a', permissions: ['test.write'] }
});
if (pending.status !== 'confirmation_required' || !pending.confirmation?.token) {
	throw new Error('Write tool did not require confirmation');
}

let ownerIsolationRejected = false;
try {
	await executeTool({
		name: 'test_write_tool',
		input: { value: 'save-me' },
		context: {
			ownerId: 'owner-b',
			permissions: ['test.write'],
			confirmationToken: pending.confirmation.token
		}
	});
} catch (error) {
	ownerIsolationRejected = error.message.includes('confirmation token');
}
if (!ownerIsolationRejected) throw new Error('Confirmation token crossed owner boundary');

const saved = await executeTool({
	name: 'test_write_tool',
	input: { value: 'save-me' },
	context: {
		ownerId: 'owner-a',
		permissions: ['test.write'],
		confirmationToken: pending.confirmation.token,
		idempotencyKey: 'write-1'
	}
});
if (saved.result?.execution !== 1) throw new Error('Confirmed write did not execute once');

const replayed = await executeTool({
	name: 'test_write_tool',
	input: { value: 'save-me' },
	context: {
		ownerId: 'owner-a',
		permissions: ['test.write'],
		idempotencyKey: 'write-1'
	}
});
if (!replayed.replayed || writeExecutions !== 1) throw new Error('Idempotency replay failed');

let reuseRejected = false;
try {
	await executeTool({
		name: 'test_write_tool',
		input: { value: 'save-me' },
		context: {
			ownerId: 'owner-a',
			permissions: ['test.write'],
			confirmationToken: pending.confirmation.token
		}
	});
} catch (error) {
	reuseRejected = error.message.includes('confirmation token');
}
if (!reuseRejected) throw new Error('Confirmation token was reusable');

const audit = listAuditEntries('owner-a', 20);
if (!audit.some(({ tool, status }) => tool === 'test_write_tool' && status === 'completed')) {
	throw new Error('Completed write audit record is missing');
}
if (listAuditEntries('owner-b', 20).some(({ status }) => status === 'completed')) {
	throw new Error('Audit owner isolation failed');
}

console.log(
	'tool_registry=ok schema_validation=ok permission=ok confirmation=ok owner_isolation=ok idempotency=ok audit=ok'
);
