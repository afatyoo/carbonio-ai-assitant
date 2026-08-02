export type AppointmentResultMessage = {
	key:
		| 'chat.appointment_created_without_attendees'
		| 'chat.appointment_created_with_attendees';
	fallback: string;
	values: { id: string };
};

export const getAppointmentResultMessage = (
	id: string,
	attendees: string | undefined
): AppointmentResultMessage => {
	const hasAttendees = String(attendees ?? '')
		.split(',')
		.some((address) => address.trim().length > 0);
	return hasAttendees
		? {
				key: 'chat.appointment_created_with_attendees',
				fallback:
					'Appointment created in Carbonio Calendar (ID: {{id}}). Invitations were sent to listed attendees.',
				values: { id }
			}
		: {
				key: 'chat.appointment_created_without_attendees',
				fallback:
					'Appointment created in Carbonio Calendar (ID: {{id}}). No invitations were sent.',
				values: { id }
			};
};
