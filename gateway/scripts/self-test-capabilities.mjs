import assert from 'node:assert/strict';

import {
	CAPABILITY_STATUS,
	CARBONIO_USER_CAPABILITIES,
	EXCLUDED_CARBONIO_CAPABILITIES,
	assertUserScopedToolDefinition,
	listCapabilitiesByStatus
} from '../src/carbonio-capabilities.js';
import { listToolDefinitions, registerTool, TOOL_RISK } from '../src/tool-registry.js';

await import('../src/mail-tools.js');
await import('../src/calendar-tools.js');

const activeCapabilities = listCapabilitiesByStatus(CAPABILITY_STATUS.ACTIVE);
const registeredTools = listToolDefinitions();
assert.equal(activeCapabilities.length, registeredTools.length);
assert.deepEqual(
	activeCapabilities.map(({ name }) => name).sort(),
	registeredTools.map(({ name }) => name).sort()
);

for (const capability of CARBONIO_USER_CAPABILITIES) {
	assert.match(capability.name, /^[a-z][a-z0-9_]{2,63}$/);
	assert.ok(['READ', 'DRAFT', 'WRITE', 'DESTRUCTIVE'].includes(capability.risk));
	assert.ok(capability.permission.includes('.'));
	assert.ok(capability.api.length > 0);
	if (['WRITE', 'DESTRUCTIVE'].includes(capability.risk)) {
		assert.notEqual(capability.status, CAPABILITY_STATUS.COMPATIBILITY_GATED);
	}
}

for (const definition of registeredTools) {
	const capability = activeCapabilities.find(({ name }) => name === definition.name);
	assert.equal(capability.risk, definition.risk, `${definition.name} risk mismatch`);
	assert.equal(capability.permission, definition.permission, `${definition.name} permission mismatch`);
	if (['DRAFT', 'WRITE', 'DESTRUCTIVE'].includes(definition.risk)) {
		assert.equal(definition.confirmation, 'required', `${definition.name} must require confirmation`);
	}
}

for (const forbidden of [
	{ name: 'reset_password', permission: 'preferences.write' },
	{ name: 'admin_create_account', permission: 'mail.write' },
	{ name: 'read_server_queue', permission: 'admin.read' },
	{ name: 'impersonate_user', permission: 'mail.read' }
]) {
	assert.throws(() => assertUserScopedToolDefinition(forbidden), /forbidden/i);
}

assert.throws(
	() =>
		registerTool(
			{
				name: 'change_password',
				description: 'Forbidden boundary test',
				inputSchema: { type: 'object', additionalProperties: false, properties: {} },
				permission: 'preferences.write',
				risk: TOOL_RISK.WRITE
			},
			() => ({})
		),
	/forbidden/i
);

assert.deepEqual(
	EXCLUDED_CARBONIO_CAPABILITIES.map(({ domain }) => domain).sort(),
	['administration', 'authentication', 'impersonation', 'internal-storage']
);

console.log(
	`carbonio_capabilities=ok active=${activeCapabilities.length} planned=${listCapabilitiesByStatus(CAPABILITY_STATUS.PLANNED).length} gated=${listCapabilitiesByStatus(CAPABILITY_STATUS.COMPATIBILITY_GATED).length} excluded=${EXCLUDED_CARBONIO_CAPABILITIES.length}`
);
