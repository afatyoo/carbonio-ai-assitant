import assert from 'node:assert/strict';
import fs from 'node:fs';

const assistantSource = fs.readFileSync('src/views/ai-assistant-view.tsx', 'utf8');

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
const emailMutationFields = assistantSource.slice(
	assistantSource.indexOf("chat.message_id"),
	assistantSource.indexOf('pendingConfirmation.preview.subject &&')
);
assert.match(emailMutationFields, /chat\.sender/);
assert.match(emailMutationFields, /chat\.date/);
assert.match(assistantSource, /<SecondaryActionButton[\s\S]*Regenerate/);
assert.ok(fs.existsSync('scripts/self-test-i18n.mjs'));

console.log(
	'carbonio_theme_tokens=ok responsive_breakpoints=ok reduced_motion=ok safe_text=ok accessible_actions=ok i18n_contract_script=ok'
);
