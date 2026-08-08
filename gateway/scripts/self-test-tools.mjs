import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import os from 'node:os';

process.env.AI_AUDIT_DB_PATH = path.join(os.tmpdir(), `carbonio-ai-tools-${randomUUID()}.sqlite`);

const { registerTool, TOOL_RISK } = await import('../src/tool-registry.js');
const { executeTool } = await import('../src/tool-runner.js');
const { listAllAuditEntries, listAuditEntries } = await import('../src/tool-audit.js');
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
		resultReference: (result) => String(result.execution),
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
if (!audit.some(({ tool, resultReference }) => tool === 'test_write_tool' && resultReference === '1')) {
	throw new Error('Write result reference is missing from audit');
}
if (listAuditEntries('owner-b', 20).some(({ status }) => status === 'completed')) {
	throw new Error('Audit owner isolation failed');
}
if (!listAllAuditEntries(20).some(({ ownerId, tool }) => ownerId === 'owner-a' && tool === 'test_write_tool')) {
	throw new Error('Administrator audit listing is incomplete');
}

await import('../src/mail-tools.js');
await import('../src/calendar-tools.js');
await import('../src/organization-tools.js');
await import('../src/extended-user-tools.js');
const mailDefinitions = listToolDefinitions();
for (const toolName of [
	'search_emails',
	'list_unread_emails',
	'get_email',
	'list_attachments',
	'get_email_thread',
	'create_email_draft',
	'update_email_draft',
	'forward_as_draft',
	'send_email',
	'mark_as_read',
	'mark_as_unread',
	'flag_email',
	'unflag_email',
	'mark_as_spam',
	'mark_as_not_spam',
	'add_tag',
	'remove_tag',
	'move_email',
	'delete_email'
]) {
	if (!mailDefinitions.some(({ name }) => name === toolName)) {
		throw new Error(`Missing registered mail tool: ${toolName}`);
	}
}
for (const toolName of [
	'archive_email', 'restore_email', 'remove_attachment',
	'list_contacts', 'get_contact', 'create_contact', 'update_contact', 'move_contact', 'tag_contact', 'delete_contact',
	'list_calendars', 'create_calendar', 'rename_calendar', 'delete_calendar',
	'respond_to_invitation', 'forward_appointment', 'dismiss_alarm', 'snooze_alarm',
	'list_shares', 'grant_share', 'revoke_share', 'send_share_notification',
	'list_filter_rules', 'create_filter_rule', 'update_filter_rule', 'delete_filter_rule',
	'list_identities', 'create_identity', 'update_identity', 'delete_identity',
	'list_signatures', 'create_signature', 'update_signature', 'delete_signature'
]) {
	assert.ok(mailDefinitions.some(({ name }) => name === toolName), `Missing extended user tool: ${toolName}`);
}
for (const toolName of [
	'list_folders',
	'create_folder',
	'rename_folder',
	'move_folder',
	'delete_folder',
	'empty_trash',
	'list_tags',
	'create_tag',
	'rename_tag',
	'delete_tag'
]) {
	assert.ok(mailDefinitions.some(({ name }) => name === toolName), `Missing ${toolName}`);
}
const {
	buildCreateFolderRequest,
	buildFolderActionRequest,
	buildIndexEmailSearchRequest,
	buildMailMessage,
	buildMessageActionRequest,
	buildTagActionRequest,
	normalizeMessageForAgent
} = await import(
	'../src/mailbox.js'
);
assert.deepEqual(buildCreateFolderRequest({ name: 'Projects', parentId: '1' }), {
	folder: { name: 'Projects', l: '1', view: 'message' }
});
assert.deepEqual(buildFolderActionRequest({ id: '20', operation: 'rename', name: 'Archive' }), {
	action: { id: '20', op: 'rename', name: 'Archive' }
});
assert.deepEqual(buildFolderActionRequest({ id: '3', operation: 'empty' }), {
	action: { id: '3', op: 'empty', recursive: 1 }
});
assert.deepEqual(buildTagActionRequest({ id: '8', operation: 'rename', name: 'Later' }), {
	action: { id: '8', op: 'rename', name: 'Later' }
});
assert.deepEqual(buildIndexEmailSearchRequest({ query: '', limit: 100, offset: 0 }), {
	limit: 100,
	needExp: 1,
	recip: '2',
	sortBy: 'dateDesc',
	offset: 0,
	types: 'message'
});
assert.equal(
	buildIndexEmailSearchRequest({ query: ' has:attachment ', limit: 100, offset: 0 }).query,
	'has:attachment'
);
assert.ok(
	!JSON.stringify(buildIndexEmailSearchRequest({ query: '', limit: 100, offset: 0 })).includes(
		'anywhere'
	)
);
if (
	JSON.stringify(buildMessageActionRequest({ id: '101', operation: 'read' })) !==
	JSON.stringify({ action: { id: '101', op: 'read' } })
) {
	throw new Error('MsgAction read payload is incorrect');
}
if (
	JSON.stringify(
		buildMessageActionRequest({ id: '102', operation: 'tag', tagName: 'Important' })
	) !== JSON.stringify({ action: { id: '102', op: 'tag', tn: 'Important' } })
) {
	throw new Error('MsgAction tag payload is incorrect');
}
if (
	JSON.stringify(
		buildMessageActionRequest({ id: '103', operation: 'move', folderId: '20' })
	) !== JSON.stringify({ action: { id: '103', op: 'move', l: '20' } })
) {
	throw new Error('MsgAction move payload is incorrect');
}
if (
	JSON.stringify(buildMessageActionRequest({ id: '104', operation: 'delete' })) !==
	JSON.stringify({ action: { id: '104', op: 'delete' } })
) {
	throw new Error('MsgAction delete payload is incorrect');
}
for (const operation of ['!read', 'flag', '!flag', 'spam', '!spam']) {
	assert.deepEqual(buildMessageActionRequest({ id: '105', operation }), {
		action: { id: '105', op: operation }
	});
}
assert.deepEqual(buildMessageActionRequest({ id: '106', operation: '!tag', tagName: 'Later' }), {
	action: { id: '106', op: '!tag', tn: 'Later' }
});
assert.throws(
	() => buildMessageActionRequest({ id: '101,102', operation: 'read' }),
	/single Carbonio item ID/
);
assert.deepEqual(
	buildMailMessage({
		mode: 'draft',
		draftId: '435',
		to: 'recipient@example.test',
		subject: 'Updated subject',
		body: 'Updated body',
		from: 'owner@example.test'
	}),
	{
		id: '435',
		su: { _content: 'Updated subject' },
		e: [
			{ a: 'recipient@example.test', t: 't' },
			{ a: 'owner@example.test', t: 'f' }
		],
		mp: [{ ct: 'text/plain', body: true, content: { _content: 'Updated body' } }]
	}
);
assert.deepEqual(
	buildMailMessage({
		mode: 'draft',
		to: 'recipient@example.test',
		subject: 'Fwd: Source',
		body: 'Forwarded body',
		originalId: '77',
		replyType: 'w'
	}),
	{
		su: { _content: 'Fwd: Source' },
		e: [{ a: 'recipient@example.test', t: 't' }],
		mp: [{ ct: 'text/plain', body: true, content: { _content: 'Forwarded body' } }],
		origid: '77',
		rt: 'w'
	}
);
assert.equal(
	buildMailMessage({
		mode: 'send',
		draftId: '435',
		to: 'recipient@example.test',
		subject: 'Send subject',
		body: 'Send body'
	}).did,
	'435'
);
const normalizedHtmlMessage = normalizeMessageForAgent(
	{
		id: 'html-1',
		su: 'HTML with attachment',
		e: [{ t: 'f', a: 'sender@example.test' }],
		mp: [
			{
				body: true,
				ct: 'text/html',
				content: {
					_content:
						'<style>.hidden{display:none}</style><p>Hello &amp; welcome</p><script>steal()</script>'
				}
			},
			{
				part: '2',
				ct: 'application/pdf',
				filename: 'invoice.pdf',
				s: 1234,
				cd: 'attachment'
			}
		]
	},
	10_000
);
if (
	normalizedHtmlMessage.body !== 'Hello & welcome' ||
	normalizedHtmlMessage.sourceBodyType !== 'text/html' ||
	normalizedHtmlMessage.attachments.length !== 1 ||
	normalizedHtmlMessage.attachments[0].filename !== 'invoice.pdf' ||
	'content' in normalizedHtmlMessage.attachments[0]
) {
	throw new Error('HTML normalization or attachment metadata boundary failed');
}
for (const toolName of [
	'get_appointment',
	'search_appointments',
	'check_free_busy',
	'search_contacts',
	'resolve_attendees',
	'propose_meeting_slots',
	'create_appointment',
	'create_calendar_draft',
	'update_appointment',
	'cancel_appointment',
	'send_meeting_invitation'
]) {
	if (!mailDefinitions.some(({ name }) => name === toolName)) {
		throw new Error(`Missing registered calendar tool: ${toolName}`);
	}
}
const {
	buildAppointmentSearchRequest,
	buildAppointmentRequest,
	buildCancelAppointmentRequest,
	buildModifyAppointmentRequest,
	buildTaskSearchRequest,
	normalizeAppointmentDetails,
	normalizeAutocompleteMatches,
	normalizeTaskForIndex,
	shouldUseAppointmentTaskFallback
} = await import('../src/calendar.js');
assert.equal(
	shouldUseAppointmentTaskFallback(new Error('Carbonio SOAP error: service.UNKNOWN_DOCUMENT')),
	true
);
assert.equal(
	shouldUseAppointmentTaskFallback(new Error('Carbonio SOAP error: service.AUTH_REQUIRED')),
	false
);
assert.deepEqual(buildTaskSearchRequest({ limit: 100 }), {
	types: 'task',
	limit: 100,
	offset: 0,
	sortBy: 'dateDesc',
	query: 'inid:15'
});
assert.equal(buildTaskSearchRequest({ limit: 100, compatibilityMode: true }).types, 'appointment');
assert.deepEqual(
	normalizeTaskForIndex({
		id: '501',
		rev: 4,
		inv: [{ comp: [{ name: 'Task title', desc: 'Task body', status: 'NEED', percentComplete: '25', e: [{ u: 1786000000000 }] }] }]
	}),
	{
		id: '501',
		title: 'Task title',
		body: 'Task body',
		status: 'NEED',
		percentComplete: 25,
		due: 1786000000000,
		revision: '4'
	}
);
assert.equal(
	buildAppointmentSearchRequest({
		start: '2026-08-02T00:00:00.000Z',
		end: '2026-08-06T00:00:00.000Z',
		query: '',
		limit: 10
	}).query,
	'inid:10'
);
const appointmentFixture = {
	organizer: 'owner@example.test',
	attendees: 'guest@example.test',
	subject: 'UAT Meeting',
	start: '2026-08-05T03:00:00.000Z',
	end: '2026-08-05T03:30:00.000Z',
	location: 'Room 1',
	body: 'Agenda'
};
const draftAppointmentRequest = buildAppointmentRequest({
	...appointmentFixture,
	draft: true
});
assert.equal(draftAppointmentRequest.m.inv.comp[0].draft, '1');
assert.equal(draftAppointmentRequest.m.inv.comp[0].neverSent, '1');
assert.deepEqual(draftAppointmentRequest.m.inv.comp[0].s, { d: '20260805T030000Z' });
assert.deepEqual(draftAppointmentRequest.m.inv.comp[0].at, [
	{ a: 'guest@example.test', d: 'guest@example.test', role: 'REQ', ptst: 'NE', rsvp: '1' }
]);
const modifyAppointmentRequest = buildModifyAppointmentRequest({
	...appointmentFixture,
	inviteId: '439',
	componentNum: 0,
	modifiedSequence: 9,
	revision: 2,
	draft: true
});
assert.equal(modifyAppointmentRequest.id, '439');
assert.equal(modifyAppointmentRequest.comp, 0);
assert.equal(modifyAppointmentRequest.ms, 9);
assert.equal(modifyAppointmentRequest.rev, 2);
assert.equal(modifyAppointmentRequest.m.inv.comp[0].draft, '1');
assert.deepEqual(
	buildCancelAppointmentRequest({
		inviteId: '439',
		componentNum: 0,
		modifiedSequence: 9,
		revision: 2
	}),
	{ id: '439', comp: 0, ms: 9, rev: 2 }
);
assert.deepEqual(
	normalizeAppointmentDetails({
		id: '438',
		ms: 9,
		rev: 2,
		inv: [
			{
				id: '439',
				comp: [
					{
						compNum: 0,
						name: 'UAT Meeting',
						loc: 'Room 1',
						s: [{ u: 1785898800000, tz: 'Asia/Jakarta' }],
						e: [{ u: 1785900600000 }],
						at: [{ a: 'guest@example.test' }],
						or: [{ a: 'owner@example.test' }],
						status: 'CONF',
						desc: 'Agenda'
					}
				]
			}
		]
	}),
	{
		id: '438',
		inviteId: '439',
		componentNum: 0,
		modifiedSequence: 9,
		revision: 2,
		recurring: false,
		subject: 'UAT Meeting',
		start: '2026-08-05T03:00:00.000Z',
		end: '2026-08-05T03:30:00.000Z',
		timezone: 'Asia/Jakarta',
		attendees: ['guest@example.test'],
		organizer: 'owner@example.test',
		location: 'Room 1',
		status: 'CONF',
		recurring: false,
		body: 'Agenda'
	}
);
assert.deepEqual(
	normalizeAutocompleteMatches([
		{
			email: 'guest@example.test',
			display: 'Guest User',
			type: 'gal',
			isGroup: '0',
			exp: '0',
			id: 'contact-1'
		}
	]),
	[
		{
			address: 'guest@example.test',
			displayName: 'Guest User',
			type: 'gal',
			isGroup: false,
			canExpand: false,
			id: 'contact-1'
		}
	]
);
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
const markReadPending = await executeTool({
	name: 'mark_as_read',
	input: {
		id: '501',
		subject: 'Source reference',
		sender: 'sender@example.test',
		date: '1785898800000'
	},
	context: { ownerId: 'owner-a', permissions: ['mail.write'] }
});
assert.deepEqual(markReadPending.confirmation?.preview, {
	kind: 'mark_as_read',
	id: '501',
	subject: 'Source reference',
	sender: 'sender@example.test',
	date: '1785898800000'
});
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
const updateInput = {
		appointmentId: '438',
		inviteId: '439',
		componentNum: 0,
		modifiedSequence: 9,
		revision: 2,
		recurring: false,
		currentSubject: 'UAT Meeting',
		currentStart: '2026-08-05T03:00:00.000Z',
		currentEnd: '2026-08-05T03:30:00.000Z',
		currentTimezone: 'Asia/Jakarta',
		currentAttendees: '',
		currentLocation: 'Room 1',
		currentBody: 'Agenda',
		subject: 'UAT Meeting revised',
		start: '2026-08-05T03:00:00.000Z',
		end: '2026-08-05T04:00:00.000Z',
		timezone: 'Asia/Jakarta',
		attendees: '',
		location: 'Room 1',
		body: 'Agenda'
};
const updatePending = await executeTool({
	name: 'update_appointment',
	input: updateInput,
	context: { ownerId: 'owner-a', permissions: ['calendar.write'] }
});
assert.equal(updatePending.confirmation?.preview?.kind, 'appointment_update');
assert.deepEqual(updatePending.confirmation?.preview?.changes, [
	{ field: 'subject', before: 'UAT Meeting', after: 'UAT Meeting revised' },
	{
		field: 'end',
		before: '2026-08-05T03:30:00.000Z',
		after: '2026-08-05T04:00:00.000Z'
	}
]);
await assert.rejects(
	executeTool({
		name: 'update_appointment',
		input: { ...updateInput, recurring: true },
		context: { ownerId: 'owner-a', permissions: ['calendar.write'] }
	}),
	/Recurring appointment mutations are not supported/
);
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
let invalidAttendeeRejected = false;
try {
	await executeTool({
		name: 'create_appointment',
		input: {
			subject: 'Invalid attendee',
			start: '2026-08-03T02:00:00.000Z',
			end: '2026-08-03T03:00:00.000Z',
			attendees: 'not-an-email'
		},
		context: { ownerId: 'owner-a', permissions: ['calendar.write'] }
	});
} catch (error) {
	invalidAttendeeRejected = error.message.includes('Invalid attendee email');
}
if (!invalidAttendeeRejected) throw new Error('Invalid attendee address was accepted');
const {
	classifyActionRequest,
	classifyCalendarActionRequest,
	classifyOrganizationActionRequest,
	isDraftActionRequest,
	isExtendedToolRequest,
	isMeetingActionRequest,
	zonedLocalToIso
} = await import('../src/agent.js');
assert.deepEqual(classifyOrganizationActionRequest('Buat folder "Projects"'), {
	tool: 'create_folder',
	input: { name: 'Projects', parentId: '1', view: 'message' }
});
assert.deepEqual(classifyOrganizationActionRequest('Rename folder ID 20 menjadi "Archive"'), {
	tool: 'rename_folder',
	input: { id: '20', name: 'Archive' }
});
assert.deepEqual(classifyOrganizationActionRequest('Move folder ID 20 to folder ID 21'), {
	tool: 'move_folder',
	input: { id: '20', parentId: '21' }
});
assert.deepEqual(classifyOrganizationActionRequest('Hapus tag ID 8'), {
	tool: 'delete_tag',
	input: { id: '8' }
});
assert.deepEqual(classifyOrganizationActionRequest('Kosongkan Trash'), {
	tool: 'empty_trash',
	input: {}
});
assert.equal(isExtendedToolRequest('Tampilkan semua kontak saya'), true);
assert.equal(isExtendedToolRequest('Create signature named Sales'), true);
assert.equal(isExtendedToolRequest('Berapa harga kopi hari ini?'), false);
const { findAvailableMeetingSlots } = await import('../src/calendar.js');
if (zonedLocalToIso('2026-08-03T10:00:00', 'Asia/Jakarta') !== '2026-08-03T03:00:00.000Z') {
	throw new Error('Appointment timezone conversion failed');
}
if (
	!isDraftActionRequest('Buat draft balasan untuk email terbaru') ||
	!isDraftActionRequest('Buatkan balasan untuk email terbaru') ||
	!isMeetingActionRequest('Buat jadwal meeting besok') ||
	!isMeetingActionRequest('Buatkan rapat besok')
) {
	throw new Error('Indonesian draft or meeting intent matching failed');
}
assert.deepEqual(classifyActionRequest('Kirim email ke guest@example.test tentang UAT'), {
	tool: 'send_email'
});
assert.deepEqual(classifyActionRequest('Teruskan email terakhir ke guest@example.test sebagai draft'), {
	tool: 'forward_as_draft'
});
assert.deepEqual(classifyActionRequest('Perbarui draft email terakhir agar lebih singkat'), {
	tool: 'update_email_draft'
});
assert.deepEqual(classifyActionRequest('Tandai email terakhir sudah dibaca'), {
	tool: 'mark_as_read'
});
assert.deepEqual(classifyActionRequest('Tandai email terakhir belum dibaca'), {
	tool: 'mark_as_unread'
});
assert.deepEqual(classifyActionRequest('Flag email terakhir'), { tool: 'flag_email' });
assert.deepEqual(classifyActionRequest('Unflag email terakhir'), { tool: 'unflag_email' });
assert.deepEqual(classifyActionRequest('Tandai email terakhir sebagai spam'), {
	tool: 'mark_as_spam'
});
assert.deepEqual(classifyActionRequest('Tandai email terakhir bukan spam'), {
	tool: 'mark_as_not_spam'
});
assert.deepEqual(classifyActionRequest('Tambahkan tag Important ke email terakhir'), {
	tool: 'add_tag',
	tagName: 'Important'
});
assert.deepEqual(classifyActionRequest('Hapus tag Important dari email terakhir'), {
	tool: 'remove_tag',
	tagName: 'Important'
});
assert.deepEqual(classifyActionRequest('Pindahkan email terakhir ke Trash'), {
	tool: 'move_email',
	folderId: '3',
	folderName: 'Trash'
});
assert.deepEqual(classifyActionRequest('Hapus permanen email terakhir'), {
	tool: 'delete_email'
});
assert.equal(classifyActionRequest('Bagaimana cara menghapus email?'), null);
assert.deepEqual(classifyCalendarActionRequest('Buat draf kalender untuk meeting besok'), {
	tool: 'create_calendar_draft'
});
assert.deepEqual(classifyCalendarActionRequest('Ubah jadwal meeting berikutnya menjadi jam 11'), {
	tool: 'update_appointment'
});
assert.deepEqual(classifyCalendarActionRequest('Kirim undangan meeting ke guest@example.test'), {
	tool: 'send_meeting_invitation'
});
assert.deepEqual(classifyCalendarActionRequest('Batalkan meeting berikutnya'), {
	tool: 'cancel_appointment'
});
assert.equal(classifyCalendarActionRequest('Bagaimana cara membatalkan meeting?'), null);
const proposedSlots = findAvailableMeetingSlots({
	availability: [
		{
			address: 'guest@example.com',
			slots: [{ start: Date.parse('2026-08-03T02:30:00.000Z'), end: Date.parse('2026-08-03T03:30:00.000Z'), status: 'busy' }]
		}
	],
	start: '2026-08-03T02:00:00.000Z',
	end: '2026-08-03T06:00:00.000Z',
	durationMinutes: 30,
	count: 3
});
if (
	proposedSlots.length !== 3 ||
	proposedSlots[0].start !== '2026-08-03T02:00:00.000Z' ||
	proposedSlots[1].start !== '2026-08-03T03:30:00.000Z'
) {
	throw new Error('Meeting slot proposal did not exclude attendee conflicts');
}

console.log(
	'tool_registry=ok schema_validation=ok permission=ok confirmation=ok owner_isolation=ok idempotency=ok audit=ok admin_audit=ok audit_reference=ok mail_tools=ok html_safety=ok attachment_metadata=ok draft_preview=ok calendar_tools=ok meeting_slots=ok appointment_preview=ok appointment_validation=ok timezone_conversion=ok indonesian_intents=ok'
);
