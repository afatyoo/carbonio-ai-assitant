const instructionPattern = /(?:ignore|disregard|override|system prompt|developer message|tool call|execute|send password|reveal secret)/i;

export const normalizeRagText = (value, maxLength = 200_000) =>
	String(value ?? '')
		.replace(/\u0000/g, '')
		.replace(/\r\n?/g, '\n')
		.replace(/[\t\f\v ]+/g, ' ')
		.replace(/ *\n */g, '\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim()
		.slice(0, maxLength);

export const chunkRagText = (value, { size = 1_200, overlap = 160 } = {}) => {
	const text = normalizeRagText(value);
	if (!text) return [];
	const chunks = [];
	let offset = 0;
	while (offset < text.length && chunks.length < 500) {
		let end = Math.min(offset + size, text.length);
		if (end < text.length) {
			const boundary = Math.max(text.lastIndexOf('\n', end), text.lastIndexOf('. ', end));
			if (boundary > offset + Math.floor(size * 0.6)) end = boundary + 1;
		}
		const content = text.slice(offset, end).trim();
		if (content) chunks.push({ content, suspicious: instructionPattern.test(content) });
		if (end >= text.length) break;
		offset = Math.max(end - overlap, offset + 1);
	}
	return chunks;
};

export const tokenizeForEmbedding = (value) =>
	[...new Set(normalizeRagText(value, 20_000).toLowerCase().match(/[\p{L}\p{N}_-]{2,}/gu) ?? [])];

export const lexicalEmbedding = (value, dimensions = 384) => {
	const vector = new Array(dimensions).fill(0);
	for (const token of tokenizeForEmbedding(value)) {
		let hash = 2166136261;
		for (const character of token) {
			hash ^= character.codePointAt(0);
			hash = Math.imul(hash, 16777619);
		}
		vector[Math.abs(hash) % dimensions] += hash & 1 ? 1 : -1;
	}
	const norm = Math.hypot(...vector) || 1;
	return vector.map((entry) => entry / norm);
};

export const cosineSimilarity = (left, right) => {
	if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return 0;
	let dot = 0;
	let leftNorm = 0;
	let rightNorm = 0;
	for (let index = 0; index < left.length; index += 1) {
		dot += Number(left[index]) * Number(right[index]);
		leftNorm += Number(left[index]) ** 2;
		rightNorm += Number(right[index]) ** 2;
	}
	return dot / ((Math.sqrt(leftNorm) * Math.sqrt(rightNorm)) || 1);
};
