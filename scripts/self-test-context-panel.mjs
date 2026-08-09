import assert from 'node:assert/strict';
import fs from 'node:fs';

import { getCarbonioSelection } from '../src/utils/carbonio-context.ts';
import {
	buildAskAiUrl,
	getAskAiContext,
	removeAskAiContextFromUrl
} from '../src/utils/ask-ai-context.ts';

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

const messageContext = {
	module: 'mail',
	objectType: 'message',
	objectId: '440',
	folderId: '2'
};
assert.equal(
	buildAskAiUrl('https://mail.example.test/carbonio/mails/folder/2/message/440', messageContext),
	'/carbonio/ai-assistant?aiContextType=message&aiContextId=440&folderId=2'
);
assert.deepEqual(
	getAskAiContext(
		'https://mail.example.test/carbonio/ai-assistant?aiContextType=conversation&aiContextId=-436&folderId=2'
	),
	{
		module: 'mail',
		objectType: 'conversation',
		objectId: '-436',
		folderId: '2',
		revision: undefined
	}
);
assert.equal(
	getAskAiContext(
		'https://mail.example.test/carbonio/ai-assistant?aiContextType=message&aiContextId=%3Cscript%3E'
	),
	null
);
assert.equal(
	removeAskAiContextFromUrl(
		'https://mail.example.test/carbonio/ai-assistant?aiContextType=message&aiContextId=440&folderId=2'
	),
	'/carbonio/ai-assistant'
);

const app = fs.readFileSync(new URL('../src/app.tsx', import.meta.url), 'utf8');
assert.match(app, /import React, \{ useEffect \} from 'react'/);
assert.match(app, /addUtilityView/);
assert.match(app, /ContextAssistantPanel/);
assert.match(app, /MailAskAiMenuBridge/);

const panel = fs.readFileSync(
	new URL('../src/views/context-assistant-panel.tsx', import.meta.url),
	'utf8'
);
assert.match(panel, /includeContext/);
assert.match(panel, /requestControllerRef\.current\?\.abort\(\)/);
assert.match(panel, /context: contextReference/);
assert.doesNotMatch(panel, /dangerouslySetInnerHTML/);

const bridge = fs.readFileSync(
	new URL('../src/integrations/mail-ask-ai-menu.tsx', import.meta.url),
	'utf8'
);
assert.match(bridge, /icon: MoreVertical/);
assert.match(bridge, /secondary-actions-menu-/);
assert.match(bridge, /ConversationMessagePreview-/);
assert.match(bridge, /contextmenu/);
assert.match(bridge, /carbonio-ai-ask-ai-action/);
assert.doesNotMatch(bridge, /innerHTML|localStorage|sessionStorage/);

const fullAssistant = fs.readFileSync(
	new URL('../src/views/ai-assistant-view.tsx', import.meta.url),
	'utf8'
);
assert.match(fullAssistant, /getAskAiContext/);
assert.match(fullAssistant, /context: askAiContext/);
assert.match(fullAssistant, /selection: \[askAiContext\.objectId\]/);

console.log('context_detection=ok ask_ai_handoff=ok exact_id_bridge=ok explicit_opt_in=ok change_cancellation=ok utility_panel=ok');
