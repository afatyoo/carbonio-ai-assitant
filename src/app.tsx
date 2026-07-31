import React, { useEffect } from 'react';

import { addRoute, addSettingsView, upsertApp } from '@zextras/carbonio-shell-ui';

import { RobotPrimaryBarIcon } from './components/robot-icon';
import { AiSettingsView } from './views/ai-settings-view';
import { AssistantSidebar } from './views/assistant-sidebar';
import { AiAssistantView } from './views/ai-assistant-view';

const APP_ID = 'carbonio-ai-assistant-ui';

const App = (): null => {
	useEffect(() => {
		addRoute({
			route: 'ai-assistant',
			position: 150,
			visible: true,
			label: 'AI Assistant',
			primaryBar: RobotPrimaryBarIcon,
			secondaryBar: AssistantSidebar,
			appView: AiAssistantView
		});

		upsertApp({
			name: APP_ID,
			display: 'AI Assistant'
		});

		addSettingsView({
			route: 'ai-assistant',
			label: 'AI Assistant',
			component: AiSettingsView
		});
	}, []);

	return null;
};

export default App;
