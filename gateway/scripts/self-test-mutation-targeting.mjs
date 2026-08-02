import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

process.env.AI_AUDIT_DB_PATH = path.join(
	os.tmpdir(),
	`carbonio-ai-mutation-targets-${randomUUID()}.sqlite`
);
process.env.AI_AGENT_PROVIDER = 'openai';
process.env.AI_AGENT_URL = 'https://api.openai.com/v1';
process.env.AI_AGENT_MODEL = 'test/mutation-targeting';
process.env.AI_MODEL_ALLOWLIST = 'test/mutation-targeting';
process.env.AI_AGENT_API_KEY = 'test-only';

const originalRequest = https.request;
const originalFetch = globalThis.fetch;
const soapRequests = [];
let activeScenario;

const appointmentDetails = ({
	id,
	subject,
	start = Date.parse('2026-08-05T03:00:00.000Z'),
	end = Date.parse('2026-08-05T03:30:00.000Z'),
	organizer = 'owner@example.test',
	attendees = []
}) => ({
	id,
	ms: 9,
	rev: 2,
	inv: [
		{
			id: `${id}-invite`,
			comp: [
				{
					compNum: 0,
					name: subject,
					s: [{ u: start, tz: 'Asia/Jakarta' }],
					e: [{ u: end, tz: 'Asia/Jakarta' }],
					or: [{ a: organizer }],
					at: attendees.map((address) => ({ a: address })),
					status: 'CONF'
				}
			]
		}
	]
});

const appointmentSearchItem = ({
	id,
	subject,
	start = Date.parse('2026-08-05T03:00:00.000Z'),
	organizer = 'owner@example.test'
}) => ({
	id,
	name: subject,
	inst: [{ s: start, dur: 30 * 60_000, name: subject, or: { a: organizer } }]
});

https.request = (options, callback) => {
	const request = new EventEmitter();
	request.setTimeout = () => request;
	request.destroy = (error) => {
		if (error) request.emit('error', error);
	};
	request.end = (payload) => {
		const operation = String(options.path).match(/\/([^/]+)Request$/)?.[1];
		const parsed = JSON.parse(String(payload));
		const input = parsed.Body?.[`${operation}Request`] ?? {};
		soapRequests.push({ operation, input });
		const result = activeScenario.respond(operation, input);
		const response = new EventEmitter();
		response.statusCode = 200;
		queueMicrotask(() => {
			callback(response);
			response.emit(
				'data',
				Buffer.from(JSON.stringify({ Body: { [`${operation}Response`]: result } }))
			);
			response.emit('end');
		});
	};
	return request;
};

globalThis.fetch = async () => ({
	ok: true,
	status: 200,
	json: async () => ({
		choices: [
			{
				message: {
					content: JSON.stringify({
						subject: 'Roadmap',
						startLocal: '2026-08-05T10:00:00',
						endLocal: '2026-08-05T10:30:00',
						timezone: 'Asia/Jakarta',
						location: '',
						body: ''
					})
				}
			}
		],
		usage: { prompt_tokens: 1, completion_tokens: 1 }
	})
});

const { runAgent } = await import('../src/agent.js');

const failures = [];
const mutationOperations = new Set(['MsgAction', 'ModifyAppointment', 'CancelAppointment']);

const runConfirmationCase = async ({ name, message, respond, assertConfirmation }) => {
	activeScenario = { respond };
	soapRequests.length = 0;
	const events = [];
	try {
		await runAgent({
			message,
			model: 'test/mutation-targeting',
			cookie: 'ZM_AUTH_TOKEN=test',
			account: { id: `owner-${name}`, name: 'owner@example.test' },
			permissions: ['mail.read', 'mail.write', 'calendar.read', 'calendar.write'],
			emit: (event, data) => events.push({ event, data })
		});
		const confirmations = events.filter(({ event }) => event === 'confirmation');
		assert.equal(confirmations.length, 1, `${name}: expected exactly one confirmation`);
		assert.equal(
			soapRequests.some(({ operation }) => mutationOperations.has(operation)),
			false,
			`${name}: mutation executed before confirmation`
		);
		assertConfirmation(confirmations[0].data, soapRequests);
	} catch (error) {
		failures.push(error);
	}
};

const runFailClosedCase = async ({ name, message, respond }) => {
	activeScenario = { respond };
	soapRequests.length = 0;
	const events = [];
	let rejection;
	try {
		await runAgent({
			message,
			model: 'test/mutation-targeting',
			cookie: 'ZM_AUTH_TOKEN=test',
			account: { id: `owner-${name}`, name: 'owner@example.test' },
			permissions: ['mail.read', 'mail.write', 'calendar.read', 'calendar.write'],
			emit: (event, data) => events.push({ event, data })
		});
	} catch (error) {
		rejection = error;
	}
	try {
		assert.ok(rejection, `${name}: unsafe target request did not fail closed`);
		assert.match(
			rejection.message,
			/(matching|match|ambiguous|clarif|target)/i,
			`${name}: target failure did not provide a safe clarification/error`
		);
		assert.equal(
			events.some(({ event }) => event === 'confirmation'),
			false,
			`${name}: unsafe target reached confirmation`
		);
		assert.equal(
			soapRequests.some(({ operation }) => mutationOperations.has(operation)),
			false,
			`${name}: unsafe target executed a mutation`
		);
	} catch (error) {
		failures.push(error);
	}
};

const mailItem = ({ id, subject, sender, date }) => ({
	id,
	su: subject,
	d: Date.parse(date),
	e: [{ t: 'f', a: sender }]
});

await runConfirmationCase({
	name: 'mark-read-explicit-id',
	message: 'Mark email id 77-remote as read',
	respond: (operation) => {
		if (operation === 'GetMsg') {
			return {
				m: [
					mailItem({
						id: '77-remote',
						subject: 'Explicit target',
						sender: 'sender@example.test',
						date: '2026-08-01T02:00:00.000Z'
					})
				]
			};
		}
		throw new Error(`Unexpected SOAP operation: ${operation}`);
	},
	assertConfirmation: (confirmation, requests) => {
		assert.equal(confirmation.input.id, '77-remote');
		assert.equal(confirmation.preview.id, '77-remote');
		assert.equal(requests.some(({ operation }) => operation === 'Search'), false);
	}
});

await runConfirmationCase({
	name: 'move-latest',
	message: 'Move the latest email to Trash',
	respond: (operation) => {
		if (operation === 'Search') {
			return {
				m: [
					mailItem({
						id: 'mail-latest',
						subject: 'Latest target',
						sender: 'sender@example.test',
						date: '2026-08-01T02:00:00.000Z'
					})
				]
			};
		}
		throw new Error(`Unexpected SOAP operation: ${operation}`);
	},
	assertConfirmation: (confirmation, requests) => {
		assert.equal(confirmation.input.id, 'mail-latest');
		assert.equal(requests.find(({ operation }) => operation === 'Search')?.input.limit, 1);
	}
});

await runConfirmationCase({
	name: 'delete-exact-subject',
	message: 'Permanently delete the email with subject "Quarterly report"',
	respond: (operation) => {
		if (operation === 'Search') {
			return {
				m: [
					mailItem({
						id: 'mail-exact',
						subject: 'Quarterly report',
						sender: 'sender@example.test',
						date: '2026-08-01T02:00:00.000Z'
					})
				]
			};
		}
		throw new Error(`Unexpected SOAP operation: ${operation}`);
	},
	assertConfirmation: (confirmation, requests) => {
		assert.equal(confirmation.input.id, 'mail-exact');
		const searchInput = requests.find(({ operation }) => operation === 'Search')?.input;
		assert.equal(searchInput.limit, 2);
		assert.match(searchInput.query, /subject:/i);
	}
});

await runFailClosedCase({
	name: 'mark-read-ambiguous-sender',
	message: 'Mark the email from alice@example.test as read',
	respond: (operation) => {
		if (operation === 'Search') {
			return {
				m: [
					mailItem({
						id: 'mail-1',
						subject: 'First status',
						sender: 'alice@example.test',
						date: '2026-08-01T02:00:00.000Z'
					}),
					mailItem({
						id: 'mail-2',
						subject: 'Second status',
						sender: 'alice@example.test',
						date: '2026-08-01T03:00:00.000Z'
					})
				]
			};
		}
		throw new Error(`Unexpected SOAP operation: ${operation}`);
	}
});

await runFailClosedCase({
	name: 'move-ordinal-word-in-subject',
	message: 'Move the email with subject "Latest update" to Trash',
	respond: (operation) => {
		if (operation === 'Search') {
			return {
				m: [
					mailItem({
						id: 'mail-latest-1',
						subject: 'Latest update',
						sender: 'sender@example.test',
						date: '2026-08-01T02:00:00.000Z'
					}),
					mailItem({
						id: 'mail-latest-2',
						subject: 'Latest update',
						sender: 'sender@example.test',
						date: '2026-08-01T03:00:00.000Z'
					})
				]
			};
		}
		throw new Error(`Unexpected SOAP operation: ${operation}`);
	}
});

await runFailClosedCase({
	name: 'move-mixed-search-results',
	message: 'Move the email with subject "Quarterly report" to Trash',
	respond: (operation) => {
		if (operation === 'Search') {
			return {
				m: [
					mailItem({
						id: 'mail-quarterly',
						subject: 'Quarterly report',
						sender: 'sender@example.test',
						date: '2026-08-01T02:00:00.000Z'
					}),
					mailItem({
						id: 'mail-unexpected',
						subject: 'Unexpected result',
						sender: 'sender@example.test',
						date: '2026-08-01T03:00:00.000Z'
					})
				]
			};
		}
		throw new Error(`Unexpected SOAP operation: ${operation}`);
	}
});

await runConfirmationCase({
	name: 'cancel-explicit-id',
	message: 'Cancel meeting with appointment id appt-direct',
	respond: (operation) => {
		if (operation === 'GetAppointment') {
			return { appt: [appointmentDetails({ id: 'appt-direct', subject: 'Direct target' })] };
		}
		throw new Error(`Unexpected SOAP operation: ${operation}`);
	},
	assertConfirmation: (confirmation, requests) => {
		assert.equal(confirmation.input.appointmentId, 'appt-direct');
		assert.equal(confirmation.input.modifiedSequence, 9);
		assert.equal(confirmation.input.revision, 2);
		assert.equal(confirmation.preview.appointmentId, 'appt-direct');
		assert.equal(confirmation.preview.modifiedSequence, 9);
		assert.equal(confirmation.preview.revision, 2);
		assert.equal(requests.some(({ operation }) => operation === 'Search'), false);
	}
});

await runConfirmationCase({
	name: 'cancel-next',
	message: 'Cancel the next meeting',
	respond: (operation) => {
		if (operation === 'Search') {
			return { appt: [appointmentSearchItem({ id: 'appt-next', subject: 'Next target' })] };
		}
		if (operation === 'GetAppointment') {
			return { appt: [appointmentDetails({ id: 'appt-next', subject: 'Next target' })] };
		}
		throw new Error(`Unexpected SOAP operation: ${operation}`);
	},
	assertConfirmation: (confirmation, requests) => {
		assert.equal(confirmation.input.appointmentId, 'appt-next');
		assert.equal(requests.find(({ operation }) => operation === 'Search')?.input.limit, 1);
	}
});

await runConfirmationCase({
	name: 'invite-exact-subject',
	message:
		'Send invitation for meeting "Roadmap" organized by owner@example.test to guest@example.test',
	respond: (operation) => {
		if (operation === 'Search') {
			return { appt: [appointmentSearchItem({ id: 'appt-exact', subject: 'Roadmap' })] };
		}
		if (operation === 'GetAppointment') {
			return { appt: [appointmentDetails({ id: 'appt-exact', subject: 'Roadmap' })] };
		}
		if (operation === 'GetFreeBusy') return { usr: [] };
		throw new Error(`Unexpected SOAP operation: ${operation}`);
	},
	assertConfirmation: (confirmation, requests) => {
		assert.equal(confirmation.input.appointmentId, 'appt-exact');
		assert.equal(confirmation.input.attendees, 'guest@example.test');
		assert.equal(confirmation.preview.modifiedSequence, 9);
		assert.equal(confirmation.preview.revision, 2);
		const searchInput = requests.find(({ operation }) => operation === 'Search')?.input;
		assert.equal(searchInput.limit, 2);
		assert.match(searchInput.query, /subject:/i);
	}
});

await runFailClosedCase({
	name: 'move-mismatched-subject',
	message: 'Move the email with subject "Quarterly report" to Trash',
	respond: (operation) => {
		if (operation === 'Search') {
			return {
				m: [
					mailItem({
						id: 'mail-3',
						subject: 'Unrelated newsletter',
						sender: 'news@example.test',
						date: '2026-08-01T02:00:00.000Z'
					})
				]
			};
		}
		throw new Error(`Unexpected SOAP operation: ${operation}`);
	}
});

await runFailClosedCase({
	name: 'delete-mismatched-date',
	message: 'Permanently delete the email dated 2026-08-01',
	respond: (operation) => {
		if (operation === 'Search') {
			return {
				m: [
					mailItem({
						id: 'mail-4',
						subject: 'Wrong day',
						sender: 'sender@example.test',
						date: '2026-08-02T02:00:00.000Z'
					})
				]
			};
		}
		throw new Error(`Unexpected SOAP operation: ${operation}`);
	}
});

await runFailClosedCase({
	name: 'update-ambiguous-subject',
	message: 'Update meeting "Roadmap" on 2026-08-05 to start at 11:00',
	respond: (operation) => {
		if (operation === 'Search') {
			return {
				appt: [
					appointmentSearchItem({ id: 'appt-1', subject: 'Roadmap' }),
					appointmentSearchItem({ id: 'appt-2', subject: 'Roadmap' })
				]
			};
		}
		if (operation === 'GetAppointment') {
			return { appt: [appointmentDetails({ id: 'appt-1', subject: 'Roadmap' })] };
		}
		throw new Error(`Unexpected SOAP operation: ${operation}`);
	}
});

await runFailClosedCase({
	name: 'update-ordinal-word-in-subject',
	message: 'Update meeting "Upcoming roadmap" to start at 11:00',
	respond: (operation) => {
		if (operation === 'Search') {
			return {
				appt: [
					appointmentSearchItem({ id: 'appt-upcoming-1', subject: 'Upcoming roadmap' }),
					appointmentSearchItem({ id: 'appt-upcoming-2', subject: 'Upcoming roadmap' })
				]
			};
		}
		if (operation === 'GetAppointment') {
			return {
				appt: [appointmentDetails({ id: 'appt-upcoming-1', subject: 'Upcoming roadmap' })]
			};
		}
		throw new Error(`Unexpected SOAP operation: ${operation}`);
	}
});

await runFailClosedCase({
	name: 'update-mixed-search-results',
	message: 'Update meeting "Roadmap" to start at 11:00',
	respond: (operation) => {
		if (operation === 'Search') {
			return {
				appt: [
					appointmentSearchItem({ id: 'appt-roadmap', subject: 'Roadmap' }),
					appointmentSearchItem({ id: 'appt-unexpected', subject: 'Unexpected result' })
				]
			};
		}
		if (operation === 'GetAppointment') {
			return { appt: [appointmentDetails({ id: 'appt-roadmap', subject: 'Roadmap' })] };
		}
		throw new Error(`Unexpected SOAP operation: ${operation}`);
	}
});

await runFailClosedCase({
	name: 'invite-mismatched-subject',
	message: 'Send invitation for meeting "Roadmap" to guest@example.test',
	respond: (operation) => {
		if (operation === 'Search') {
			return { appt: [appointmentSearchItem({ id: 'appt-3', subject: 'Budget review' })] };
		}
		if (operation === 'GetAppointment') {
			return { appt: [appointmentDetails({ id: 'appt-3', subject: 'Budget review' })] };
		}
		if (operation === 'GetFreeBusy') return { usr: [] };
		throw new Error(`Unexpected SOAP operation: ${operation}`);
	}
});

await runFailClosedCase({
	name: 'cancel-mismatched-date',
	message: 'Cancel meeting "Budget review" on 2026-08-05',
	respond: (operation) => {
		if (operation === 'Search') {
			return {
				appt: [
					appointmentSearchItem({
						id: 'appt-4',
						subject: 'Budget review',
						start: Date.parse('2026-08-06T03:00:00.000Z')
					})
				]
			};
		}
		if (operation === 'GetAppointment') {
			return {
				appt: [
					appointmentDetails({
						id: 'appt-4',
						subject: 'Budget review',
						start: Date.parse('2026-08-06T03:00:00.000Z'),
						end: Date.parse('2026-08-06T03:30:00.000Z')
					})
				]
			};
		}
		throw new Error(`Unexpected SOAP operation: ${operation}`);
	}
});

https.request = originalRequest;
globalThis.fetch = originalFetch;

if (failures.length > 0) {
	throw new AggregateError(failures, `${failures.length} mutation target safety case(s) failed`);
}

console.log(
	'mail_explicit_id=ok mail_latest=ok mail_exact_subject=ok mail_mark_read_ambiguous=ok mail_subject_ordinal_ambiguous=ok mail_mixed_results_rejected=ok mail_move_mismatch=ok mail_delete_mismatch=ok calendar_explicit_id=ok calendar_next=ok calendar_exact_subject=ok calendar_update_ambiguous=ok calendar_subject_ordinal_ambiguous=ok calendar_mixed_results_rejected=ok calendar_invite_mismatch=ok calendar_cancel_mismatch=ok'
);
