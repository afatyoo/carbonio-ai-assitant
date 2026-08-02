import {
	cancelAppointment,
	createAppointment,
	getAppointment,
	getFreeBusy,
	proposeMeetingSlots,
	resolveAttendees,
	searchContacts,
	searchAppointments,
	updateAppointment,
	validateAppointmentInput
} from './calendar.js';
import { registerTool, TOOL_RISK } from './tool-registry.js';

const rangeProperties = {
	start: { type: 'string', minLength: 20, maxLength: 40 },
	end: { type: 'string', minLength: 20, maxLength: 40 }
};

const appointmentContentProperties = {
	subject: { type: 'string', minLength: 1, maxLength: 300 },
	attendees: { type: 'string', maxLength: 5_000 },
	location: { type: 'string', maxLength: 500 },
	body: { type: 'string', maxLength: 20_000 },
	timezone: { type: 'string', maxLength: 100 },
	...rangeProperties
};

const appointmentVersionProperties = {
	appointmentId: { type: 'string', minLength: 1, maxLength: 100 },
	inviteId: { type: 'string', minLength: 1, maxLength: 100 },
	componentNum: { type: 'integer', minimum: 0, maximum: 10_000 },
	modifiedSequence: { type: 'integer', minimum: 0 },
	revision: { type: 'integer', minimum: 0 },
	recurring: { type: 'boolean' }
};

const validateNonRecurring = (input) => {
	if (input.recurring) {
		throw new Error('Recurring appointment mutations are not supported in the core release');
	}
};

const validateAppointmentMutation = (input) => {
	validateNonRecurring(input);
	validateAppointmentInput(input);
};

const currentAppointmentProperties = {
	currentSubject: { type: 'string', maxLength: 300 },
	currentStart: { type: 'string', maxLength: 40 },
	currentEnd: { type: 'string', maxLength: 40 },
	currentTimezone: { type: 'string', maxLength: 100 },
	currentAttendees: { type: 'string', maxLength: 5_000 },
	currentLocation: { type: 'string', maxLength: 500 },
	currentBody: { type: 'string', maxLength: 20_000 }
};

const appointmentChanges = (input) =>
	[
		['subject', 'currentSubject'],
		['start', 'currentStart'],
		['end', 'currentEnd'],
		['timezone', 'currentTimezone'],
		['attendees', 'currentAttendees'],
		['location', 'currentLocation'],
		['body', 'currentBody']
	]
		.filter(([next, current]) => String(input[next] ?? '') !== String(input[current] ?? ''))
		.map(([next, current]) => ({
			field: next,
			before: String(input[current] ?? ''),
			after: String(input[next] ?? '')
		}));

const appointmentPreview = (kind, input) => ({
	kind,
	appointmentId: input.appointmentId ?? '',
	inviteId: input.inviteId ?? '',
	subject: input.subject,
	start: input.start,
	end: input.end,
	attendees: input.attendees ?? '',
	location: input.location ?? '',
	body: input.body ?? '',
	timezone: input.timezone || process.env.AI_DEFAULT_TIMEZONE || 'Asia/Jakarta',
	calendar: 'Calendar',
	reminder: 'None'
});

registerTool(
	{
		name: 'get_appointment',
		description: 'Read one Carbonio appointment with bounded content and version metadata.',
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			required: ['id'],
			properties: { id: { type: 'string', minLength: 1, maxLength: 100 } }
		},
		permission: 'calendar.read',
		risk: TOOL_RISK.READ,
		confirmation: 'none',
		timeoutMs: 25_000,
		maxResultBytes: 48_000
	},
	(input, context) => getAppointment({ cookie: context.cookie, ...input })
);

registerTool(
	{
		name: 'search_contacts',
		description: 'Search bounded Carbonio contacts and GAL autocomplete results.',
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			required: ['query'],
			properties: {
				query: { type: 'string', minLength: 1, maxLength: 300 },
				type: { type: 'string', enum: ['all', 'account', 'resource', 'group'] },
				limit: { type: 'integer', minimum: 1, maximum: 50 }
			}
		},
		permission: 'calendar.read',
		risk: TOOL_RISK.READ,
		confirmation: 'none',
		timeoutMs: 25_000,
		maxResultBytes: 48_000
	},
	(input, context) => searchContacts({ cookie: context.cookie, ...input })
);

registerTool(
	{
		name: 'resolve_attendees',
		description: 'Resolve attendee email addresses against Carbonio contacts and GAL.',
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			required: ['attendees'],
			properties: { attendees: { type: 'string', minLength: 1, maxLength: 5_000 } }
		},
		permission: 'calendar.read',
		risk: TOOL_RISK.READ,
		confirmation: 'none',
		timeoutMs: 25_000,
		maxResultBytes: 64_000
	},
	(input, context) => resolveAttendees({ cookie: context.cookie, ...input })
);

registerTool(
	{
		name: 'search_appointments',
		description: 'Search the authenticated user calendar in a bounded date range.',
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			required: ['start', 'end'],
			properties: {
				...rangeProperties,
				query: { type: 'string', maxLength: 500 },
				limit: { type: 'integer', minimum: 1, maximum: 50 }
			}
		},
		permission: 'calendar.read',
		risk: TOOL_RISK.READ,
		confirmation: 'none',
		timeoutMs: 25_000,
		maxResultBytes: 64_000
	},
	(input, context) => searchAppointments({ cookie: context.cookie, ...input })
);

registerTool(
	{
		name: 'check_free_busy',
		description: 'Read bounded free/busy slots for up to 50 attendees.',
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			required: ['attendees', 'start', 'end'],
			properties: {
				attendees: { type: 'string', minLength: 3, maxLength: 5_000 },
				...rangeProperties
			}
		},
		permission: 'calendar.read',
		risk: TOOL_RISK.READ,
		confirmation: 'none',
		timeoutMs: 25_000,
		maxResultBytes: 64_000
	},
	(input, context) => getFreeBusy({ cookie: context.cookie, ...input })
);

registerTool(
	{
		name: 'propose_meeting_slots',
		description: 'Propose up to five bounded meeting slots that do not overlap attendee free/busy data.',
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			required: ['start', 'end'],
			properties: {
				attendees: { type: 'string', maxLength: 5_000 },
				...rangeProperties,
				durationMinutes: { type: 'integer', minimum: 15, maximum: 480 },
				count: { type: 'integer', minimum: 1, maximum: 5 }
			}
		},
		permission: 'calendar.read',
		risk: TOOL_RISK.READ,
		confirmation: 'none',
		timeoutMs: 25_000,
		maxResultBytes: 16_000
	},
	(input, context) => proposeMeetingSlots({ cookie: context.cookie, ...input })
);

registerTool(
	{
		name: 'create_appointment',
		description: 'Create a Carbonio calendar appointment and optionally invite attendees.',
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			required: ['subject', 'start', 'end'],
			properties: appointmentContentProperties
		},
		permission: 'calendar.write',
		risk: TOOL_RISK.WRITE,
		confirmation: 'required',
		validate: validateAppointmentInput,
		timeoutMs: 30_000,
		maxResultBytes: 8_000,
		resultReference: (result) => String(result.id ?? '').slice(0, 200),
		preview: (input) => appointmentPreview('appointment', input)
	},
	(input, context) =>
		createAppointment({ cookie: context.cookie, organizer: context.accountName, ...input })
);

registerTool(
	{
		name: 'create_calendar_draft',
		description: 'Create an unsent Carbonio calendar draft; attendees are never notified.',
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			required: ['subject', 'start', 'end'],
			properties: appointmentContentProperties
		},
		permission: 'calendar.write',
		risk: TOOL_RISK.DRAFT,
		confirmation: 'required',
		validate: validateAppointmentInput,
		timeoutMs: 30_000,
		maxResultBytes: 8_000,
		resultReference: (result) => String(result.id ?? '').slice(0, 200),
		preview: (input) => appointmentPreview('calendar_draft', input)
	},
	(input, context) =>
		createAppointment({
			cookie: context.cookie,
			organizer: context.accountName,
			...input,
			draft: true
		})
);

registerTool(
	{
		name: 'update_appointment',
		description: 'Stage an appointment update without notifying attendees.',
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			required: [
				'appointmentId',
				'inviteId',
				'componentNum',
				'modifiedSequence',
				'revision',
				'recurring',
				'currentSubject',
				'currentStart',
				'currentEnd',
				'currentTimezone',
				'currentAttendees',
				'currentLocation',
				'currentBody',
				'subject',
				'start',
				'end'
			],
			properties: {
				...appointmentVersionProperties,
				...appointmentContentProperties,
				...currentAppointmentProperties
			}
		},
		permission: 'calendar.write',
		risk: TOOL_RISK.DRAFT,
		confirmation: 'required',
		validate: validateAppointmentMutation,
		timeoutMs: 30_000,
		maxResultBytes: 8_000,
		resultReference: (result) => String(result.id ?? '').slice(0, 200),
		preview: (input) => ({
			...appointmentPreview('appointment_update', input),
			changes: appointmentChanges(input)
		})
	},
	(input, context) =>
		updateAppointment({
			cookie: context.cookie,
			organizer: context.accountName,
			...input,
			draft: true
		})
);

registerTool(
	{
		name: 'send_meeting_invitation',
		description: 'Apply an appointment update and send invitations after explicit confirmation.',
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			required: [
				'appointmentId',
				'inviteId',
				'componentNum',
				'modifiedSequence',
				'revision',
				'recurring',
				'subject',
				'start',
				'end',
				'attendees'
			],
			properties: { ...appointmentVersionProperties, ...appointmentContentProperties }
		},
		permission: 'calendar.write',
		risk: TOOL_RISK.WRITE,
		confirmation: 'required',
		validate: validateAppointmentMutation,
		timeoutMs: 30_000,
		maxResultBytes: 8_000,
		resultReference: (result) => String(result.id ?? '').slice(0, 200),
		preview: (input) => appointmentPreview('meeting_invitation', input)
	},
	(input, context) =>
		updateAppointment({
			cookie: context.cookie,
			organizer: context.accountName,
			...input,
			draft: false
		})
);

registerTool(
	{
		name: 'cancel_appointment',
		description: 'Cancel one Carbonio appointment after strong explicit confirmation.',
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			required: [
				'appointmentId',
				'inviteId',
				'componentNum',
				'modifiedSequence',
				'revision',
				'recurring'
			],
			properties: {
				...appointmentVersionProperties,
				subject: { type: 'string', maxLength: 300 },
				start: { type: 'string', maxLength: 40 },
				end: { type: 'string', maxLength: 40 },
				attendees: { type: 'string', maxLength: 5_000 }
			}
		},
		permission: 'calendar.write',
		risk: TOOL_RISK.DESTRUCTIVE,
		confirmation: 'required',
		validate: validateNonRecurring,
		timeoutMs: 30_000,
		maxResultBytes: 8_000,
		resultReference: (result) => String(result.id ?? '').slice(0, 200),
		preview: (input) => ({
			kind: 'appointment_cancel',
			appointmentId: input.appointmentId,
			subject: input.subject ?? '',
			start: input.start ?? '',
			end: input.end ?? '',
			attendees: input.attendees ?? ''
		})
	},
	(input, context) =>
		cancelAppointment({ cookie: context.cookie, id: input.appointmentId, ...input })
);
