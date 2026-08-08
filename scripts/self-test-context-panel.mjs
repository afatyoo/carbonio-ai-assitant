import assert from 'node:assert/strict';
import fs from 'node:fs';

import { getCarbonioSelection } from '../src/utils/carbonio-context.ts';

assert.deepEqual(
	getCarbonioSelection('https://mail.example.test/carbonio/mails/message/440?folderId=2'),
	{ module: 'mail', objectType: 'message', objectId: '440', folderId: '2', revision: undefined }
);
assert.deepEqual(
	getCarbonioSelection('https://mail.example.test/carbonio/mails/folder/2?messageId=440&rev=7'),
	{ module: 'mail', objectType: 'message', objectId: '440', folderId: undefined, revision: '7' }
);
assert.deepEqual(
	getCarbonioSelection('https://mail.example.test/carbonio/mails/folder/2/message/440'),
	{
		module: 'mail',
		objectType: 'message',
		objectId: '440',
		folderId: undefined,
		revision: undefined
	}
);
assert.deepEqual(
	getCarbonioSelection('https://mail.example.test/carbonio/calendar/appointment/91'),
	{ module: 'calendar', objectType: 'appointment', objectId: '91', revision: undefined }
);
assert.equal(getCarbonioSelection('https://mail.example.test/carbonio/mails/folder/2'), null);

const app = fs.readFileSync(new URL('../src/app.tsx', import.meta.url), 'utf8');
assert.match(app, /addUtilityView/);
assert.match(app, /ContextAssistantPanel/);

const panel = fs.readFileSync(
	new URL('../src/views/context-assistant-panel.tsx', import.meta.url),
	'utf8'
);
assert.match(panel, /includeContext/);
assert.match(panel, /requestControllerRef\.current\?\.abort\(\)/);
assert.match(panel, /context: contextReference/);
assert.doesNotMatch(panel, /dangerouslySetInnerHTML/);

console.log('context_detection=ok explicit_opt_in=ok change_cancellation=ok utility_panel=ok');
