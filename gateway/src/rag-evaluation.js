const percentile = (values, fraction) => {
	if (!values.length) return 0;
	const sorted = [...values].sort((left, right) => left - right);
	return sorted[Math.min(Math.ceil(sorted.length * fraction) - 1, sorted.length - 1)];
};

export const validateEvaluationCases = (cases) => {
	if (!Array.isArray(cases) || cases.length < 1 || cases.length > 50) {
		throw new Error('RAG evaluation requires between 1 and 50 cases');
	}
	return cases.map((item, index) => {
		const query = String(item?.query ?? '').trim();
		if (!query || query.length > 1_000) throw new Error(`Evaluation case ${index + 1} has an invalid query`);
		const expectedSourceIds = Array.isArray(item.expectedSourceIds)
			? [...new Set(item.expectedSourceIds.map(String).filter(Boolean))].slice(0, 20)
			: [];
		const noAnswer = Boolean(item.noAnswer);
		if (!noAnswer && expectedSourceIds.length === 0) {
			throw new Error(`Evaluation case ${index + 1} requires expectedSourceIds or noAnswer`);
		}
		return { query, expectedSourceIds, noAnswer };
	});
};

export const evaluateRagCases = async (casesValue, retrieve, { limit = 8 } = {}) => {
	const cases = validateEvaluationCases(casesValue);
	const rows = [];
	for (const item of cases) {
		const startedAt = Date.now();
		const results = await retrieve(item.query, { limit });
		const resultIds = [...new Set(results.map(({ sourceId }) => String(sourceId)))];
		const hits = item.expectedSourceIds.filter((id) => resultIds.includes(id)).length;
		rows.push({
			query: item.query,
			expectedSourceIds: item.expectedSourceIds,
			resultSourceIds: resultIds,
			hits,
			noAnswer: item.noAnswer,
			correctNoAnswer: item.noAnswer && resultIds.length === 0,
			latencyMs: Date.now() - startedAt
		});
	}
	const expectedTotal = rows.reduce((sum, row) => sum + row.expectedSourceIds.length, 0);
	const hitTotal = rows.reduce((sum, row) => sum + row.hits, 0);
	const noAnswerRows = rows.filter(({ noAnswer }) => noAnswer);
	const recallAt8 = expectedTotal ? hitTotal / expectedTotal : 1;
	const noAnswerPrecision = noAnswerRows.length
		? noAnswerRows.filter(({ correctNoAnswer }) => correctNoAnswer).length / noAnswerRows.length
		: 1;
	const retrievalP95Ms = percentile(rows.map(({ latencyMs }) => latencyMs), 0.95);
	return {
		summary: {
			cases: rows.length,
			recallAt8,
			noAnswerPrecision,
			retrievalP95Ms,
			passed: recallAt8 >= 0.85 && noAnswerPrecision >= 0.9 && retrievalP95Ms <= 800
		},
		cases: rows
	};
};
