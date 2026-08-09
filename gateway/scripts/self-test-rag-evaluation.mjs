import assert from 'node:assert/strict';

import { evaluateRagCases, validateEvaluationCases } from '../src/rag-evaluation.js';

assert.throws(() => validateEvaluationCases([]), /between 1 and 50/);
const report = await evaluateRagCases([
	{ query: 'alpha', expectedSourceIds: ['1'] },
	{ query: 'no evidence', noAnswer: true }
], async (query) => query === 'alpha' ? [{ sourceId: '1' }] : []);
assert.equal(report.summary.recallAt8, 1);
assert.equal(report.summary.noAnswerPrecision, 1);
assert.equal(report.summary.passed, true);

console.log('rag_evaluation=ok recall=ok no_answer=ok latency=ok');
