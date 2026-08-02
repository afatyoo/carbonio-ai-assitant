import assert from 'node:assert/strict';
import fs from 'node:fs';

const assistantSource = fs.readFileSync('src/views/ai-assistant-view.tsx', 'utf8');
const english = JSON.parse(fs.readFileSync('i18n/en.json', 'utf8'));
const indonesian = JSON.parse(fs.readFileSync('i18n/id.json', 'utf8'));

const flattenKeys = (value, prefix = '') =>
	Object.entries(value).flatMap(([key, child]) => {
		const next = prefix ? `${prefix}.${key}` : key;
		return child && typeof child === 'object' && !Array.isArray(child)
			? flattenKeys(child, next)
			: [next];
	});

assert.match(assistantSource, /theme\.palette\.gray6\.regular/);
assert.match(assistantSource, /theme\.palette\.text\.regular/);
assert.match(assistantSource, /@media \(max-width: 48rem\)/);
assert.match(assistantSource, /@media \(max-width: 38rem\)/);
assert.match(assistantSource, /grid-template-columns: minmax\(0, 1fr\)/);
assert.match(assistantSource, /@media \(prefers-reduced-motion: reduce\)/);
assert.equal(assistantSource.includes('dangerouslySetInnerHTML'), false);
assert.equal(assistantSource.includes("import { Button } from '@zextras/carbonio-design-system'"), false);
assert.match(assistantSource, /<PrimaryActionButton[\s\S]*confirmationPresentation/);
assert.match(assistantSource, /getConfirmationPresentation/);
assert.match(assistantSource, /<SecondaryActionButton[\s\S]*Regenerate/);
assert.deepEqual(flattenKeys(english).sort(), flattenKeys(indonesian).sort());

console.log(
	'carbonio_theme_tokens=ok responsive_breakpoints=ok reduced_motion=ok safe_text=ok accessible_actions=ok i18n_parity=ok'
);
