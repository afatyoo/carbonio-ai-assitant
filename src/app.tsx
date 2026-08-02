import { useEffect } from 'react';

import { addRoute, addSettingsView, upsertApp } from '@zextras/carbonio-shell-ui';

import { RobotPrimaryBarIcon } from './components/robot-icon';
import { useAppTranslation } from './i18n/use-app-translation';
import { AiSettingsView } from './views/ai-settings-view';
import { AssistantSidebar } from './views/assistant-sidebar';
import { AiAssistantView } from './views/ai-assistant-view';

const APP_ID = 'carbonio-ai-assistant-ui';

const App = (): null => {
	const { ready, t } = useAppTranslation();
	const appName = t('app.name', 'AI Assistant');

	useEffect(() => {
		if (!ready) return;
		addRoute({
			route: 'ai-assistant',
			position: 150,
			visible: true,
			label: appName,
			primaryBar: RobotPrimaryBarIcon,
			secondaryBar: AssistantSidebar,
			appView: AiAssistantView
		});

		upsertApp({
			name: APP_ID,
			display: appName
		});

		addSettingsView({
			route: 'ai-assistant',
			label: appName,
			component: AiSettingsView
		});
	}, [appName, ready]);

	return null;
};

export default App;
