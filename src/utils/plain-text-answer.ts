const PRESENTATION_RULE = /^\s*(?:-{3,}|_{3,}|\*{3,})\s*$/gm;
const HEADING_PREFIX = /^\s{0,3}#{1,6}\s+/gm;
const LABELED_EPOCH = /^(\s*(?:[-*]\s*)?(?:Waktu|Time|Date|Tanggal):\s*)(\d{13})\s*$/gim;

const formatEpoch = (value: string, locale: string): string => {
	const timestamp = Number(value);
	if (!Number.isFinite(timestamp)) return value;
	return new Intl.DateTimeFormat(locale, {
		dateStyle: 'medium',
		timeStyle: 'short'
	}).format(new Date(timestamp));
};

export const normalizeAssistantDisplayText = (value: string, locale = 'en'): string =>
	String(value ?? '')
		.replaceAll('\r\n', '\n')
		.replace(PRESENTATION_RULE, '')
		.replace(HEADING_PREFIX, '')
		.replace(/\*\*([^*\n]+)\*\*/g, '$1')
		.replace(/__([^_\n]+)__/g, '$1')
		.replace(LABELED_EPOCH, (_match, label: string, timestamp: string) =>
			`${label}${formatEpoch(timestamp, locale)}`
		)
		.replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s).,:;!?])/g, '$1$2')
		.replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,:;!?])/g, '$1$2')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
