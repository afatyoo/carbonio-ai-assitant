import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const EXPECTED_OFFICIAL = ['en', 'fr', 'hi', 'id', 'it', 'pt', 'ru', 'es', 'th'];
const PLACEHOLDER_PATTERN = /\{\{[A-Za-z0-9_]+\}\}/g;

const args = process.argv.slice(2);
const useDist = args.includes('--dist');
const localesArgument = args.find((argument) => argument.startsWith('--locales='));
const requestedLocales = localesArgument
	? localesArgument.slice('--locales='.length).split(',').filter(Boolean)
	: null;

const manifest = JSON.parse(fs.readFileSync('i18n/locales.json', 'utf8'));
assert.equal(manifest.fallback, 'en', 'The fallback locale must be English');
assert.deepEqual(
	manifest.official,
	EXPECTED_OFFICIAL,
	'The locale manifest must contain the approved official Carbonio locales in canonical order'
);

const locales = requestedLocales ?? manifest.official;
for (const locale of locales) {
	assert.ok(manifest.official.includes(locale), `Unknown locale requested: ${locale}`);
}

const flatten = (value, prefix = '', output = new Map()) => {
	assert.ok(value && typeof value === 'object' && !Array.isArray(value), `Invalid object at ${prefix || '<root>'}`);
	for (const [key, child] of Object.entries(value)) {
		const next = prefix ? `${prefix}.${key}` : key;
		if (child && typeof child === 'object' && !Array.isArray(child)) {
			flatten(child, next, output);
		} else {
			assert.equal(typeof child, 'string', `${next} must be a string`);
			assert.ok(child.trim().length > 0, `${next} must not be empty`);
			output.set(next, child);
		}
	}
	return output;
};

const loadCatalog = (directory, locale) => {
	const filename = path.join(directory, `${locale}.json`);
	assert.ok(fs.existsSync(filename), `Missing locale catalog: ${filename}`);
	return flatten(JSON.parse(fs.readFileSync(filename, 'utf8')));
};

const placeholderMultiset = (value) => (value.match(PLACEHOLDER_PATTERN) ?? []).sort();
const canonical = loadCatalog('i18n', manifest.fallback);
const canonicalKeys = [...canonical.keys()].sort();

for (const locale of locales) {
	const catalog = loadCatalog('i18n', locale);
	assert.deepEqual([...catalog.keys()].sort(), canonicalKeys, `${locale} key set differs from English`);
	for (const key of canonicalKeys) {
		assert.deepEqual(
			placeholderMultiset(catalog.get(key)),
			placeholderMultiset(canonical.get(key)),
			`${locale}.${key} has different placeholders from English`
		);
	}
}

const sourceFiles = [];
const collectSourceFiles = (directory) => {
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		const filename = path.join(directory, entry.name);
		if (entry.isDirectory()) collectSourceFiles(filename);
		else if (/\.tsx?$/.test(entry.name)) sourceFiles.push(filename);
	}
};
collectSourceFiles('src');

const sourceKeys = new Set();
for (const filename of sourceFiles) {
	const source = fs.readFileSync(filename, 'utf8');
	for (const match of source.matchAll(/\bt\(\s*['"]([^'"]+)['"]/g)) sourceKeys.add(match[1]);
	for (const match of source.matchAll(/\bkey:\s*['"]((?:app|sidebar|chat|status|settings)\.[^'"]+)['"]/g)) {
		sourceKeys.add(match[1]);
	}
}

const missingSourceKeys = [...sourceKeys].filter((key) => !canonical.has(key)).sort();
assert.deepEqual(missingSourceKeys, [], `English catalog is missing source keys: ${missingSourceKeys.join(', ')}`);

if (useDist) {
	for (const locale of locales) {
		const sourceCatalog = loadCatalog('i18n', locale);
		const builtCatalog = loadCatalog('dist/i18n', locale);
		assert.deepEqual([...builtCatalog.entries()], [...sourceCatalog.entries()], `dist catalog differs for ${locale}`);
	}
}

console.log(
	`i18n_contract=ok locales=${locales.join(',')} keys=${canonicalKeys.length} source_keys=${sourceKeys.size} dist=${useDist ? 'verified' : 'skipped'}`
);
