import { soapRequest } from './mailbox.js';

const parseRange = (start, end, maxDays = 93) => {
	const startMs = Date.parse(start);
	const endMs = Date.parse(end);
	if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
		throw new Error('Calendar start and end must be valid ISO date-times');
	}
	if (endMs <= startMs) throw new Error('Calendar end must be after start');
	if (endMs - startMs > maxDays * 86_400_000) {
		throw new Error(`Calendar range cannot exceed ${maxDays} days`);
	}
	return { startMs, endMs };
};

export const validateAppointmentInput = ({ start, end }) => {
	parseRange(start, end, 7);
};

const toCarbonioUtc = (milliseconds) =>
	new Date(milliseconds).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

const parseAddresses = (value) =>
	String(value ?? '')
		.split(',')
		.map((address) => address.trim())
		.filter(Boolean);

const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);
const isTrue = (value) => value === true || value === 1 || value === '1';

const normalizeAppointment = (appointment, instance = appointment) => ({
	id: String(appointment.id ?? ''),
	name: String(instance.name ?? appointment.name ?? '(No title)').slice(0, 300),
	location: String(instance.loc ?? appointment.loc ?? '').slice(0, 500),
	start: Number(instance.s ?? appointment.d ?? 0),
	end:
		Number(instance.s ?? appointment.d ?? 0) +
		Number(instance.dur ?? appointment.dur ?? 0),
	status: String(instance.status ?? appointment.status ?? ''),
	participationStatus: String(instance.ptst ?? appointment.ptst ?? ''),
	organizer: String(instance.or?.a ?? appointment.or?.a ?? ''),
	recurring: isTrue(instance.recur ?? appointment.recur),
	allDay: isTrue(instance.allDay ?? appointment.allDay)
});

export const searchAppointments = async ({ cookie, start, end, query = '', limit = 20 }) => {
	const { startMs, endMs } = parseRange(start, end);
	const boundedLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
	const result = await soapRequest(
		'Search',
		{
			types: 'appointment',
			calExpandInstStart: startMs,
			calExpandInstEnd: endMs,
			limit: boundedLimit,
			offset: 0,
			sortBy: 'dateAsc',
			query: query.trim()
		},
		cookie
	);
	const normalized = [];
	for (const appointment of asArray(result.appt)) {
		const instances = asArray(appointment.inst);
		if (instances.length === 0) instances.push(appointment);
		for (const instance of instances) {
			normalized.push(normalizeAppointment(appointment, instance));
			if (normalized.length >= boundedLimit) return normalized;
		}
	}
	return normalized;
};

export const getFreeBusy = async ({ cookie, attendees, start, end }) => {
	const { startMs, endMs } = parseRange(start, end, 31);
	const addresses = parseAddresses(attendees).slice(0, 50);
	if (addresses.length === 0) throw new Error('At least one attendee is required');
	const result = await soapRequest(
		'GetFreeBusy',
		{ s: startMs, e: endMs, name: addresses.join(',') },
		cookie
	);
	return asArray(result.usr).map((user) => ({
		address: String(user.id ?? ''),
		slots: [
			...asArray(user.b).map((slot) => ({ ...slot, status: 'busy' })),
			...asArray(user.t).map((slot) => ({ ...slot, status: 'tentative' })),
			...asArray(user.u).map((slot) => ({ ...slot, status: 'out_of_office' })),
			...asArray(user.n).map((slot) => ({ ...slot, status: 'unknown' }))
		]
			.map((slot) => ({
				start: Number(slot.s),
				end: Number(slot.e),
				status: slot.status
			}))
			.sort((left, right) => left.start - right.start)
	}));
};

export const createAppointment = async ({
	cookie,
	organizer,
	attendees = '',
	subject,
	start,
	end,
	location = '',
	body = ''
}) => {
	const { startMs, endMs } = parseRange(start, end, 7);
	const addresses = parseAddresses(attendees).slice(0, 50);
	const attendeeSpecs = addresses.map((address) => ({
		a: address,
		d: address,
		role: 'REQ',
		ptst: 'NE',
		rsvp: '1'
	}));
	const result = await soapRequest(
		'CreateAppointment',
		{
			echo: 0,
			forcesend: 0,
			m: {
				l: '10',
				e: [
					{ a: organizer, p: organizer, t: 'f' },
					...addresses.map((address) => ({ a: address, t: 't' }))
				],
				su: subject,
				inv: {
					comp: [
						{
							name: subject,
							loc: location,
							status: 'CONF',
							fb: 'B',
							transp: 'O',
							class: 'PUB',
							allDay: '0',
							isOrg: '1',
							s: { d: toCarbonioUtc(startMs) },
							e: { d: toCarbonioUtc(endMs) },
							or: { a: organizer, d: organizer },
							at: attendeeSpecs
						}
					]
				},
				mp: { ct: 'text/plain', content: body }
			}
		},
		cookie
	);
	const id = result.calItemId ?? result.apptId ?? result.m?.[0]?.id ?? result.m?.id;
	if (!id) throw new Error('Carbonio did not return the created appointment ID');
	return {
		id: String(id),
		inviteId: String(result.invId ?? ''),
		subject,
		start: new Date(startMs).toISOString(),
		end: new Date(endMs).toISOString(),
		attendees: addresses,
		status: 'created'
	};
};
