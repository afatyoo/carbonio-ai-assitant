import { useEffect } from 'react';

import { useAppTranslation } from '../i18n/use-app-translation';
import { AskAiMailContext, buildAskAiUrl } from '../utils/ask-ai-context';

const MENU_TEST_ID = 'dropdown-popper-list';
const ASK_AI_TEST_ID = 'carbonio-ai-ask-ai-action';
const MAX_MENU_DELAY_MS = 2_000;

type PendingTarget = {
	context: AskAiMailContext;
	createdAt: number;
	existingMenus: Set<Element>;
};

const idFromTestId = (element: Element, prefix: string): string | null => {
	const testId = element.getAttribute('data-testid') ?? '';
	const value = testId.startsWith(prefix) ? testId.slice(prefix.length) : '';
	return /^[A-Za-z0-9:_.-]{1,200}$/.test(value) ? value : null;
};

const currentFolderId = (): string | undefined =>
	window.location.pathname.match(/\/mails\/folder\/([^/?#]+)/i)?.[1];

const messageTargetFromClick = (event: MouseEvent): AskAiMailContext | null => {
	const target = event.target instanceof Element ? event.target : null;
	const button = target?.closest('button');
	if (!button?.querySelector('[data-testid="icon: MoreVertical"]')) return null;
	const container = button.closest(
		'[data-testid^="open-message-"], [data-testid^="ConversationMessagePreview-"], [data-testid^="MailPreview-"]'
	);
	if (!container) return null;
	const prefixes = ['open-message-', 'ConversationMessagePreview-', 'MailPreview-'];
	const objectId = prefixes.map((prefix) => idFromTestId(container, prefix)).find(Boolean);
	return objectId
		? {
				module: 'mail',
				objectType: 'message',
				objectId,
				folderId: currentFolderId()
			}
		: null;
};

const conversationTargetFromContextMenu = (event: MouseEvent): AskAiMailContext | null => {
	const target = event.target instanceof Element ? event.target : null;
	const container = target?.closest(
		'[data-testid^="secondary-actions-menu-"], [data-testid^="hover-container-"]'
	);
	if (!container) return null;
	const prefixes = ['secondary-actions-menu-', 'hover-container-'];
	const objectId = prefixes.map((prefix) => idFromTestId(container, prefix)).find(Boolean);
	return objectId
		? {
				module: 'mail',
				objectType: 'conversation',
				objectId,
				folderId: currentFolderId()
			}
		: null;
};

const replaceIconWithRobot = (item: Element): void => {
	const svg = item.querySelector('svg');
	if (!svg) return;
	svg.setAttribute('viewBox', '0 0 32 32');
	svg.replaceChildren();
	const namespace = 'http://www.w3.org/2000/svg';
	const add = (name: string, attributes: Record<string, string>): void => {
		const node = document.createElementNS(namespace, name);
		for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
		svg.append(node);
	};
	add('path', { d: 'M16 4v4', stroke: 'currentColor', 'stroke-width': '2.2', 'stroke-linecap': 'round' });
	add('circle', { cx: '16', cy: '3.5', r: '1.5', fill: 'currentColor' });
	add('rect', { x: '6', y: '8', width: '20', height: '17', rx: '5', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.2' });
	add('circle', { cx: '12', cy: '15', r: '2', fill: 'currentColor' });
	add('circle', { cx: '20', cy: '15', r: '2', fill: 'currentColor' });
	add('path', { d: 'M11 21h10', stroke: 'currentColor', 'stroke-width': '2.2', 'stroke-linecap': 'round' });
};

const installMenuItem = (
	menu: Element,
	context: AskAiMailContext,
	label: string
): void => {
	if (menu.querySelector(`[data-testid="${ASK_AI_TEST_ID}"]`)) return;
	const template = menu.querySelector('[data-testid="dropdown-item"]');
	if (!template) return;
	const item = template.cloneNode(true) as HTMLElement;
	item.setAttribute('data-testid', ASK_AI_TEST_ID);
	item.setAttribute('role', 'menuitem');
	item.setAttribute('tabindex', '0');
	item.style.cursor = 'pointer';
	const labels = item.querySelectorAll('[data-component="Text"]');
	const text = labels.item(labels.length - 1);
	if (!text) return;
	text.textContent = label;
	replaceIconWithRobot(item);
	const openAssistant = (event: Event): void => {
		event.preventDefault();
		event.stopPropagation();
		window.location.assign(buildAskAiUrl(window.location.href, context));
	};
	item.addEventListener('click', openAssistant);
	item.addEventListener('keydown', (event) => {
		if (event.key === 'Enter' || event.key === ' ') openAssistant(event);
	});
	menu.prepend(item);
};

export const MailAskAiMenuBridge = (): null => {
	const { t, ready } = useAppTranslation();

	useEffect(() => {
		if (!ready) return undefined;
		let pending: PendingTarget | null = null;
		const captureClick = (event: MouseEvent): void => {
			const context = messageTargetFromClick(event);
			if (context) {
				pending = {
					context,
					createdAt: Date.now(),
					existingMenus: new Set(document.querySelectorAll(`[data-testid="${MENU_TEST_ID}"]`))
				};
			}
		};
		const captureContextMenu = (event: MouseEvent): void => {
			const context = conversationTargetFromContextMenu(event);
			if (context) {
				pending = {
					context,
					createdAt: Date.now(),
					existingMenus: new Set(document.querySelectorAll(`[data-testid="${MENU_TEST_ID}"]`))
				};
			}
		};
		const inject = (): void => {
			if (!pending || Date.now() - pending.createdAt > MAX_MENU_DELAY_MS) {
				pending = null;
				return;
			}
			const menus = Array.from(document.querySelectorAll(`[data-testid="${MENU_TEST_ID}"]`));
			const menu = menus.find(
				(candidate) =>
					!pending?.existingMenus.has(candidate) &&
					!candidate.querySelector(`[data-testid="${ASK_AI_TEST_ID}"]`)
			);
			if (!menu) return;
			installMenuItem(menu, pending.context, t('context.ask_ai', 'Ask AI'));
			pending = null;
		};
		const observer = new MutationObserver(() => queueMicrotask(inject));
		document.addEventListener('click', captureClick, true);
		document.addEventListener('contextmenu', captureContextMenu, true);
		observer.observe(document.body, { childList: true, subtree: true });
		return (): void => {
			document.removeEventListener('click', captureClick, true);
			document.removeEventListener('contextmenu', captureContextMenu, true);
			observer.disconnect();
		};
	}, [ready, t]);

	return null;
};
