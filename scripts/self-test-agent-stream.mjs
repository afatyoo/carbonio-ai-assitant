import assert from 'node:assert/strict';

import { createAgentStreamError } from '../src/api/stream-error.ts';

assert.equal(
	createAgentStreamError('Provider unavailable', 'uat-request-123').message,
	'Provider unavailable (request ID: uat-request-123)'
);

assert.equal(
	createAgentStreamError('', '').message,
	'AI Agent stream failed'
);

console.log('stream_error_request_id=ok');
