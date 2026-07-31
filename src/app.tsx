import React, { useEffect } from 'react';

import { addRoute, upsertApp } from '@zextras/carbonio-shell-ui';

import { AiAssistantView } from './views/ai-assistant-view';

const APP_ID = 'carbonio-ai-assistant-ui';

const App = (): null => {
	useEffect(() => {
		addRoute({
			route: 'ai-assistant',
			position: 150,
			visible: true,
			label: 'AI Assistant',
			primaryBar: 'MessageCircleOutline',
			appView: AiAssistantView
		});

		upsertApp({
			name: APP_ID,
			display: 'AI Assistant'
		});
	}, []);

	return null;
};

export default App;
