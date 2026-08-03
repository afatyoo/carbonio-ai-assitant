import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SEMVER_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const CHECKSUM_PATTERN = /^[0-9a-f]{64} {2}\S+$/;

const readJson = async (filePath) => JSON.parse(await readFile(filePath, 'utf8'));

const requireMatch = (content, pattern, message) => {
	if (!pattern.test(content)) throw new Error(message);
};

export const validateRepositoryReleaseContract = async ({ projectRoot, expectedVersion }) => {
	const rootPackage = await readJson(path.join(projectRoot, 'package.json'));
	const gatewayPackage = await readJson(path.join(projectRoot, 'gateway/package.json'));
	const gatewayLock = await readJson(path.join(projectRoot, 'gateway/package-lock.json'));
	const version = rootPackage.version;
	if (version !== expectedVersion) {
		throw new Error(`Root package version ${version} does not match ${expectedVersion}`);
	}
	for (const [label, candidate] of [
		['gateway package', gatewayPackage.version],
		['gateway lock root', gatewayLock.version],
		['gateway lock package', gatewayLock.packages?.['']?.version]
	]) {
		if (candidate !== version) {
			throw new Error(`${label} version ${candidate ?? ''} does not match ${version}`);
		}
	}

	const reportRelativePath = `docs/releases/v${version}.md`;
	const report = await readFile(path.join(projectRoot, reportRelativePath), 'utf8');
	requireMatch(
		report,
		new RegExp(`^# Carbonio AI Assistant v${version.replaceAll('.', '\\.')}\\s*$`, 'm'),
		`Release report title does not match ${version}`
	);
	for (const heading of [
		'Executive summary',
		'Risk acceptance',
		'CI/CD and verification matrix',
		'Complete closed-bug ledger',
		'Live UAT results',
		'Known limitations and open gates',
		'Deferred scope',
		'Installation, upgrade, rollback, and verification'
	]) {
		requireMatch(report, new RegExp(`^## ${heading.replaceAll('/', '\\/')}\\s*$`, 'm'), `Release report is missing section: ${heading}`);
	}
	for (let bugNumber = 1; bugNumber <= 25; bugNumber += 1) {
		const bugId = `BUG-${String(bugNumber).padStart(3, '0')}`;
		const headingPattern = new RegExp(`^### ${bugId}\\b`, 'm');
		requireMatch(report, headingPattern, `Release report is missing ${bugId}`);
		const sectionStart = report.search(headingPattern);
		const afterHeadingStart = report.indexOf('\n', sectionStart) + 1;
		const afterHeading = report.slice(afterHeadingStart);
		const nextSectionOffset = afterHeading.search(/^### BUG-|^## /m);
		const section =
			nextSectionOffset >= 0
				? report.slice(sectionStart, afterHeadingStart + nextSectionOffset)
				: report.slice(sectionStart);
		for (const detail of ['Symptom', 'Root cause', 'Resolution', 'Regression/evidence']) {
			if (!section.includes(`- **${detail}:**`)) {
				throw new Error(`${bugId} is missing detail: ${detail}`);
			}
		}
	}
	const closedBugCount = report.match(/^### BUG-[0-9]{3}\b/gm)?.length ?? 0;
	if (closedBugCount < 25) {
		throw new Error(`Release report must contain at least 25 closed bugs; found ${closedBugCount}`);
	}

	for (const publicFile of ['README.md', 'CHANGELOG.md']) {
		const content = await readFile(path.join(projectRoot, publicFile), 'utf8');
		if (!content.includes(reportRelativePath)) {
			throw new Error(`${publicFile} must link ${reportRelativePath}`);
		}
	}

	const packageScript = await readFile(path.join(projectRoot, 'deploy/package-release.sh'), 'utf8');
	requireMatch(
		packageScript,
		/docs\/releases\/v\$\{version\}\.md/,
		'Packaging must resolve the report from the package version'
	);
	requireMatch(
		packageScript,
		/RELEASE_NOTES\.md/,
		'Packaging must include the report as RELEASE_NOTES.md'
	);

	const ciWorkflow = await readFile(path.join(projectRoot, '.github/workflows/ci.yml'), 'utf8');
	requireMatch(
		ciWorkflow,
		/pnpm run self-test:release/,
		'CI workflow must run the release report contract'
	);
	const releaseWorkflow = await readFile(
		path.join(projectRoot, '.github/workflows/release.yml'),
		'utf8'
	);
	requireMatch(
		releaseWorkflow,
		/pnpm run self-test:release/,
		'Release workflow must run the release report contract'
	);
	requireMatch(
		releaseWorkflow,
		/node scripts\/build-release-notes\.mjs/,
		'Release workflow must compose exact-build release notes'
	);
	requireMatch(
		releaseWorkflow,
		/--notes-file\s+release\/github-release-notes\.md/,
		'Release workflow must publish the curated body with --notes-file'
	);
	if (releaseWorkflow.includes('--generate-notes')) {
		throw new Error('Release workflow must not replace the curated body with --generate-notes');
	}

	return { version, reportRelativePath, closedBugCount };
};

export const buildReleaseNotes = async ({
	reportPath,
	version,
	tag,
	commit,
	runUrl,
	checksumPath,
	outputPath
}) => {
	if (!SEMVER_PATTERN.test(version ?? '')) {
		throw new Error(`Invalid release version: ${version ?? ''}`);
	}
	if (tag !== `v${version}`) {
		throw new Error(`Tag ${tag ?? ''} does not match version ${version}`);
	}
	if (!COMMIT_PATTERN.test(commit ?? '')) {
		throw new Error(`Invalid release commit: ${commit ?? ''}`);
	}
	if (!URL.canParse(runUrl ?? '') || new URL(runUrl).protocol !== 'https:') {
		throw new Error(`Invalid release workflow URL: ${runUrl ?? ''}`);
	}

	const report = (await readFile(reportPath, 'utf8')).trim();
	if (!report) {
		throw new Error(`Release report is empty: ${reportPath}`);
	}
	const checksum = (await readFile(checksumPath, 'utf8')).trim();
	if (!CHECKSUM_PATTERN.test(checksum)) {
		throw new Error(`Invalid SHA-256 checksum record: ${checksumPath}`);
	}

	const output = `${report}\n\n## Exact-build verification\n\n- Tag: \`${tag}\`\n- Commit: \`${commit}\`\n- Release workflow: ${runUrl}\n- Artifact checksum: \`${checksum}\`\n`;
	await writeFile(outputPath, output, 'utf8');
	return output;
};

const parseArgs = (args) => {
	const values = {};
	for (let index = 0; index < args.length; index += 2) {
		const flag = args[index];
		const value = args[index + 1];
		if (!flag?.startsWith('--') || value === undefined) {
			throw new Error(`Invalid CLI argument near: ${flag ?? ''}`);
		}
		values[flag.slice(2)] = value;
	}
	return values;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const args = parseArgs(process.argv.slice(2));
	await buildReleaseNotes({
		reportPath: args.report,
		version: args.version,
		tag: args.tag,
		commit: args.commit,
		runUrl: args['run-url'],
		checksumPath: args.checksum,
		outputPath: args.output
	});
}
