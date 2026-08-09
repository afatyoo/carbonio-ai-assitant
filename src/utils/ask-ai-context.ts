import type { CarbonioSelection } from './carbonio-context';

const IDENTIFIER_PATTERN = /^[A-Za-z0-9:_.-]{1,200}$/;

export type AskAiMailContext = CarbonioSelection & {
	module: 'mail';
	objectType: 'conversation' | 'message';
};

const validIdentifier = (value: string | null): string | undefined => {
	const normalized = value?.trim() ?? '';
	return IDENTIFIER_PATTERN.test(normalized) ? normalized : undefined;
};

export const buildAskAiUrl = (href: string, context: AskAiMailContext): string => {
	const current = new URL(href, 'https://carbonio.invalid');
	const target = new URL('/carbonio/ai-assistant', current.origin);
	target.searchParams.set('aiContextType', context.objectType);
	target.searchParams.set('aiContextId', context.objectId);
	if (context.folderId) target.searchParams.set('folderId', context.folderId);
	if (context.revision) target.searchParams.set('revision', context.revision);
	return `${target.pathname}${target.search}`;
};

export const getAskAiContext = (href: string): AskAiMailContext | null => {
	const url = new URL(href, 'https://carbonio.invalid');
	if (!/\/carbonio\/ai-assistant\/?$/i.test(url.pathname)) return null;
	const objectType = url.searchParams.get('aiContextType');
	if (objectType !== 'message' && objectType !== 'conversation') return null;
	const objectId = validIdentifier(url.searchParams.get('aiContextId'));
	if (!objectId) return null;
	return {
		module: 'mail',
		objectType,
		objectId,
		folderId: validIdentifier(url.searchParams.get('folderId')),
		revision: validIdentifier(url.searchParams.get('revision'))
	};
};

export const removeAskAiContextFromUrl = (href: string): string => {
	const url = new URL(href, 'https://carbonio.invalid');
	for (const key of ['aiContextType', 'aiContextId', 'folderId', 'revision']) {
		url.searchParams.delete(key);
	}
	return `${url.pathname}${url.search}${url.hash}`;
};
