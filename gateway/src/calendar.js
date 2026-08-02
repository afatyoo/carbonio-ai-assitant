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

export const validateAppointmentInput = ({ start, end, attendees = '', timezone = '' }) => {
	parseRange(start, end, 7);
	for (const address of parseAddresses(attendees)) {
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
			throw new Error(`Invalid attendee email address: ${address.slice(0, 100)}`);
		}
	}
	if (timezone) new Intl.DateTimeFormat('en', { timeZone: timezone });
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

const normalizeCalendarDate = (value) => {
	if (Number.isFinite(Number(value?.u))) return new Date(Number(value.u)).toISOString();
	const compact = String(value?.d ?? '');
	const match = compact.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
	return match
		? `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.000Z`
		: '';
};

export const normalizeAppointmentDetails = (appointment) => {
	const invite = asArray(appointment?.inv)[0] ?? {};
	const component = asArray(invite.comp)[0] ?? {};
	return {
		id: String(appointment?.id ?? ''),
		inviteId: String(invite.id ?? ''),
		componentNum: Number(component.compNum ?? 0),
		modifiedSequence: Number(appointment?.ms ?? 0),
		revision: Number(appointment?.rev ?? 0),
		subject: String(component.name ?? appointment?.name ?? '(No title)').slice(0, 300),
		start: normalizeCalendarDate(component.s),
		end: normalizeCalendarDate(component.e),
		timezone: String(component.s?.tz ?? component.e?.tz ?? '').slice(0, 100),
		attendees: asArray(component.at)
			.map(({ a }) => String(a ?? '').trim())
			.filter(Boolean)
			.slice(0, 50),
		organizer: String(component.or?.a ?? '').slice(0, 320),
		location: String(component.loc ?? '').slice(0, 500),
		status: String(component.status ?? '').slice(0, 20),
		recurring: Boolean(component.recur),
		body: String(component.desc ?? appointment?.fr ?? '').slice(0, 20_000)
	};
};

export const normalizeAutocompleteMatches = (matches) =>
	asArray(matches).slice(0, 50).map((match) => ({
		address: String(match.email ?? '').split(',')[0].trim().slice(0, 320),
		displayName: String(match.display ?? match.full ?? '').slice(0, 300),
		type: String(match.type ?? '').slice(0, 30),
		isGroup: isTrue(match.isGroup),
		canExpand: isTrue(match.exp),
		id: String(match.id ?? '').slice(0, 200)
	}));

export const getAppointment = async ({ cookie, id }) => {
	const result = await soapRequest(
		'GetAppointment',
		{ id, sync: 1, includeContent: 1, includeInvites: 1 },
		cookie
	);
	const appointment = asArray(result.appt)[0] ?? result.appt;
	if (!appointment) throw new Error('Carbonio appointment was not found');
	return normalizeAppointmentDetails(appointment);
};

export const searchContacts = async ({ cookie, query, type = 'all', limit = 20 }) => {
	const boundedLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
	const result = await soapRequest(
		'AutoComplete',
		{ name: query.trim(), t: type, needExp: 1, includeGal: 1 },
		cookie
	);
	return normalizeAutocompleteMatches(result.match).slice(0, boundedLimit);
};

export const resolveAttendees = async ({ cookie, attendees }) => {
	const tokens = parseAddresses(attendees).slice(0, 50);
	const resolved = [];
	for (const token of tokens) {
		if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(token)) {
			resolved.push({ input: token, address: token.toLowerCase(), resolved: true, candidates: [] });
			continue;
		}
		const candidates = await searchContacts({ cookie, query: token, type: 'all', limit: 5 });
		resolved.push({
			input: token,
			address: candidates.length === 1 ? candidates[0].address : '',
			resolved: candidates.length === 1,
			candidates
		});
	}
	return resolved;
};

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

export const findAvailableMeetingSlots = ({
	availability = [],
	start,
	end,
	durationMinutes = 30,
	count = 3,
	stepMinutes = 30
}) => {
	const { startMs, endMs } = parseRange(start, end, 7);
	const durationMs = Math.min(Math.max(Number(durationMinutes) || 30, 15), 480) * 60_000;
	const stepMs = Math.min(Math.max(Number(stepMinutes) || 30, 15), 240) * 60_000;
	const boundedCount = Math.min(Math.max(Number(count) || 3, 1), 5);
	const busy = availability.flatMap(({ slots = [] }) => slots).filter(({ status }) =>
		['busy', 'tentative', 'out_of_office', 'unknown'].includes(status)
	);
	const results = [];
	for (let candidate = startMs; candidate + durationMs <= endMs; candidate += stepMs) {
		const candidateEnd = candidate + durationMs;
		if (busy.some((slot) => Number(slot.start) < candidateEnd && Number(slot.end) > candidate)) {
			continue;
		}
		results.push({
			start: new Date(candidate).toISOString(),
			end: new Date(candidateEnd).toISOString()
		});
		if (results.length >= boundedCount) break;
	}
	return results;
};

export const proposeMeetingSlots = async ({
	cookie,
	attendees = '',
	start,
	end,
	durationMinutes = 30,
	count = 3
}) => {
	const addresses = parseAddresses(attendees).slice(0, 50);
	const availability =
		addresses.length > 0 ? await getFreeBusy({ cookie, attendees, start, end }) : [];
	return findAvailableMeetingSlots({
		availability,
		start,
		end,
		durationMinutes,
		count
	});
};

export const buildAppointmentRequest = ({
	organizer,
	attendees = '',
	subject,
	start,
	end,
	location = '',
	body = '',
	draft = false
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
	return {
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
							draft: draft ? '1' : '0',
							neverSent: draft ? '1' : '0',
							s: { d: toCarbonioUtc(startMs) },
							e: { d: toCarbonioUtc(endMs) },
							or: { a: organizer, d: organizer },
							at: attendeeSpecs,
							desc: body
						}
					]
				},
				mp: { ct: 'text/plain', content: body }
			}
	};
};

export const buildModifyAppointmentRequest = ({
	inviteId,
	componentNum,
	modifiedSequence,
	revision,
	...appointment
}) => ({
	id: inviteId,
	comp: componentNum,
	ms: modifiedSequence,
	rev: revision,
	...buildAppointmentRequest(appointment)
});

export const buildCancelAppointmentRequest = ({
	inviteId,
	componentNum,
	modifiedSequence,
	revision
}) => ({ id: inviteId, comp: componentNum, ms: modifiedSequence, rev: revision });

const appointmentResult = (result, input, status) => {
	const id =
		result.calItemId ?? result.apptId ?? result.m?.[0]?.id ?? result.m?.id ?? input.appointmentId;
	if (!id && status !== 'cancelled') {
		throw new Error('Carbonio did not return the appointment ID');
	}
	return {
		id: String(id ?? input.id ?? ''),
		inviteId: String(result.invId ?? input.inviteId ?? ''),
		subject: input.subject ?? '',
		start: input.start ?? '',
		end: input.end ?? '',
		attendees: parseAddresses(input.attendees),
		status
	};
};

export const createAppointment = async ({ cookie, ...input }) => {
	const result = await soapRequest('CreateAppointment', buildAppointmentRequest(input), cookie);
	return appointmentResult(result, input, input.draft ? 'draft_created' : 'created');
};

export const updateAppointment = async ({ cookie, ...input }) => {
	const result = await soapRequest('ModifyAppointment', buildModifyAppointmentRequest(input), cookie);
	return appointmentResult(result, input, input.draft ? 'draft_updated' : 'updated_and_sent');
};

export const cancelAppointment = async ({ cookie, id = '', ...input }) => {
	await soapRequest('CancelAppointment', buildCancelAppointmentRequest(input), cookie);
	return appointmentResult({}, { ...input, id }, 'cancelled');
};
