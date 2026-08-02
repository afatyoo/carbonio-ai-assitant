const maxOutputCharacters = Math.min(
	Math.max(Number(process.env.AI_MAX_OUTPUT_CHARACTERS ?? 50_000), 1_000),
	200_000
);

export const sanitizeModelOutput = (value) =>
	String(value ?? '')
		.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
		.slice(0, maxOutputCharacters);
