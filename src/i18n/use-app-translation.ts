import { useCallback, useEffect, useState } from 'react';

import { getI18n } from '@zextras/carbonio-shell-ui';

type TranslationOptions = Record<string, string | number | boolean>;

export const useAppTranslation = (): {
	t: (key: string, fallback: string, options?: TranslationOptions) => string;
	locale: string;
	ready: boolean;
} => {
	const i18n = getI18n();
	const [revision, setRevision] = useState(0);

	useEffect(() => {
		const refresh = (): void => setRevision((current) => current + 1);
		i18n.on('languageChanged', refresh);
		i18n.on('loaded', refresh);
		return (): void => {
			i18n.off('languageChanged', refresh);
			i18n.off('loaded', refresh);
		};
	}, [i18n]);

	const t = useCallback(
		(key: string, fallback: string, options: TranslationOptions = {}): string => {
			void revision;
			return String(i18n.t(key, { defaultValue: fallback, ...options }));
		},
		[i18n, revision]
	);

	return {
		t,
		locale: i18n.resolvedLanguage ?? i18n.language ?? 'en',
		ready: i18n.isInitialized && i18n.hasLoadedNamespace('translation')
	};
};
