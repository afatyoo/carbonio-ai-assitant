import path from 'node:path';
import { randomUUID } from 'node:crypto';
import os from 'node:os';

process.env.AI_AUDIT_DB_PATH = path.join(os.tmpdir(), `carbonio-ai-tools-${randomUUID()}.sqlite`);

const { registerTool, TOOL_RISK } = await import('../src/tool-registry.js');
const { executeTool } = await import('../src/tool-runner.js');
const { listAuditEntries } = await import('../src/tool-audit.js');
const { listToolDefinitions } = await import('../src/tool-registry.js');

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

await import('../src/mail-tools.js');
await import('../src/calendar-tools.js');
const mailDefinitions = listToolDefinitions();
for (const toolName of [
	'search_emails',
	'list_unread_emails',
	'get_email',
	'get_email_thread',
	'create_email_draft'
]) {
	if (!mailDefinitions.some(({ name }) => name === toolName)) {
		throw new Error(`Missing registered mail tool: ${toolName}`);
	}
}
for (const toolName of ['search_appointments', 'check_free_busy', 'create_appointment']) {
	if (!mailDefinitions.some(({ name }) => name === toolName)) {
		throw new Error(`Missing registered calendar tool: ${toolName}`);
	}
}
const draftPending = await executeTool({
	name: 'create_email_draft',
	input: {
		to: 'recipient@example.com',
		subject: 'Confirmation test',
		body: 'This draft must not be written during the self-test.'
	},
	context: { ownerId: 'owner-a', permissions: ['mail.draft'] }
});
if (
	draftPending.status !== 'confirmation_required' ||
	draftPending.confirmation?.preview?.kind !== 'email_draft'
) {
	throw new Error('Email draft preview and confirmation flow failed');
}
const appointmentPending = await executeTool({
	name: 'create_appointment',
	input: {
		subject: 'Confirmation test',
		start: '2026-08-03T02:00:00.000Z',
		end: '2026-08-03T03:00:00.000Z'
	},
	context: { ownerId: 'owner-a', permissions: ['calendar.write'] }
});
if (
	appointmentPending.status !== 'confirmation_required' ||
	appointmentPending.confirmation?.preview?.kind !== 'appointment'
) {
	throw new Error('Appointment preview and confirmation flow failed');
}
let invalidAppointmentRejected = false;
try {
	await executeTool({
		name: 'create_appointment',
		input: {
			subject: 'Invalid range',
			start: '2026-08-03T03:00:00.000Z',
			end: '2026-08-03T02:00:00.000Z'
		},
		context: { ownerId: 'owner-a', permissions: ['calendar.write'] }
	});
} catch (error) {
	invalidAppointmentRejected = error.message.includes('end must be after start');
}
if (!invalidAppointmentRejected) throw new Error('Invalid appointment range was accepted');

console.log(
	'tool_registry=ok schema_validation=ok permission=ok confirmation=ok owner_isolation=ok idempotency=ok audit=ok mail_tools=ok draft_preview=ok calendar_tools=ok appointment_preview=ok appointment_validation=ok'
);
