export type CarbonioContextModule = 'calendar' | 'mail';

export type CarbonioContextReference = {
	module: CarbonioContextModule;
	objectType: 'appointment' | 'conversation' | 'message';
	objectId: string;
	action: string;
	revision?: string;
	folderId?: string;
	selection?: string[];
};

export type CarbonioSelection = Omit<CarbonioContextReference, 'action'>;

const decodePathValue = (value: string): string => {
	try {
		return decodeURIComponent(value);
	} catch {
		return value;
	}
};

const firstQueryValue = (url: URL, names: string[]): string | null => {
	for (const name of names) {
		const value = url.searchParams.get(name)?.trim();
		if (value) return value;
	}
	return null;
};

export const getCarbonioSelection = (href: string): CarbonioSelection | null => {
	const url = new URL(href, 'https://carbonio.invalid');
	const mailMatch = url.pathname.match(
		/\/mails\/(?:[^/?#]+\/)*(mail|message|conversation)\/([^/?#]+)/i
	);
	const mailQuery = firstQueryValue(url, ['messageId', 'mailId', 'conversationId']);
	if (mailMatch?.[2] || mailQuery) {
		const isConversation = mailMatch?.[1]?.toLowerCase() === 'conversation' ||
			url.searchParams.has('conversationId');
		return {
			module: 'mail',
			objectType: isConversation ? 'conversation' : 'message',
			objectId: decodePathValue(mailMatch?.[2] ?? mailQuery ?? ''),
			folderId: firstQueryValue(url, ['folderId']) ?? undefined,
			revision: firstQueryValue(url, ['revision', 'rev']) ?? undefined
		};
	}

	const calendarMatch = url.pathname.match(
		/\/(?:calendar|calendars)\/(?:appointment|event)\/([^/?#]+)/i
	);
	const calendarQuery = firstQueryValue(url, ['appointmentId', 'eventId']);
	if (calendarMatch?.[1] || calendarQuery) {
		return {
			module: 'calendar',
			objectType: 'appointment',
			objectId: decodePathValue(calendarMatch?.[1] ?? calendarQuery ?? ''),
			revision: firstQueryValue(url, ['revision', 'rev']) ?? undefined
		};
	}

	return null;
};
