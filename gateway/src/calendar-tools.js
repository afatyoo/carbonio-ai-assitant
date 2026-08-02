import {
	createAppointment,
	getFreeBusy,
	searchAppointments,
	validateAppointmentInput
} from './calendar.js';
import { registerTool, TOOL_RISK } from './tool-registry.js';

const rangeProperties = {
	start: { type: 'string', minLength: 20, maxLength: 40 },
	end: { type: 'string', minLength: 20, maxLength: 40 }
};

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
		name: 'create_appointment',
		description: 'Create a Carbonio calendar appointment and optionally invite attendees.',
		inputSchema: {
			type: 'object',
			additionalProperties: false,
			required: ['subject', 'start', 'end'],
			properties: {
				subject: { type: 'string', minLength: 1, maxLength: 300 },
				attendees: { type: 'string', maxLength: 5_000 },
				location: { type: 'string', maxLength: 500 },
				body: { type: 'string', maxLength: 20_000 },
				...rangeProperties
			}
		},
		permission: 'calendar.write',
		risk: TOOL_RISK.WRITE,
		confirmation: 'required',
		validate: validateAppointmentInput,
		timeoutMs: 30_000,
		maxResultBytes: 8_000,
		preview: (input) => ({ kind: 'appointment', ...input })
	},
	(input, context) =>
		createAppointment({ cookie: context.cookie, organizer: context.accountName, ...input })
);
