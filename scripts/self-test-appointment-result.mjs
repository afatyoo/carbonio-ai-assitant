import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import ts from 'typescript';

const source = await fs.readFile('src/utils/appointment-result.ts', 'utf8');
const output = ts.transpileModule(source, {
	compilerOptions: {
		module: ts.ModuleKind.ES2022,
		target: ts.ScriptTarget.ES2022
	}
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
const { getAppointmentResultMessage } = await import(moduleUrl);

assert.deepEqual(getAppointmentResultMessage('438', ''), {
	key: 'chat.appointment_created_without_attendees',
	fallback: 'Appointment created in Carbonio Calendar (ID: {{id}}). No invitations were sent.',
	values: { id: '438' }
});
assert.deepEqual(getAppointmentResultMessage('439', 'one@example.test, two@example.test'), {
	key: 'chat.appointment_created_with_attendees',
	fallback:
		'Appointment created in Carbonio Calendar (ID: {{id}}). Invitations were sent to listed attendees.',
	values: { id: '439' }
});

console.log('appointment_result_without_attendees=ok appointment_result_with_attendees=ok');
