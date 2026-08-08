import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	buildReleaseNotes,
	validateRepositoryReleaseContract
} from './build-release-notes.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspace = await mkdtemp(path.join(tmpdir(), 'carbonio-ai-release-report-'));

try {
	const reportPath = path.join(workspace, 'report.md');
	const checksumPath = path.join(workspace, 'archive.tar.gz.sha256');
	const outputPath = path.join(workspace, 'github-release-notes.md');
	const commit = '0123456789abcdef0123456789abcdef01234567';
	const runUrl = 'https://github.com/afatyoo/carbonio-ai-assitant/actions/runs/123456789';
	const checksum = 'a'.repeat(64);

	await writeFile(reportPath, '# Carbonio AI Assistant v1 Beta\n\nVerified report body.\n', 'utf8');
	await writeFile(
		checksumPath,
		`${checksum}  carbonio-ai-assistant-v1.0.2.tar.gz\n`,
		'utf8'
	);

	await buildReleaseNotes({
		reportPath,
		version: '1.0.2',
		tag: 'v1.0.2',
		commit,
		runUrl,
		checksumPath,
		outputPath
	});

	const output = await readFile(outputPath, 'utf8');
	assert.match(output, /Verified report body\./);
	assert.match(output, /## Exact-build verification/);
	assert.match(output, /Tag: `v1\.0\.2`/);
	assert.match(output, new RegExp(`Commit: \`${commit}\``));
	assert.match(output, new RegExp(`Release workflow: ${runUrl}`));
	assert.match(output, new RegExp(`Artifact checksum: \`${checksum}  carbonio-ai-assistant-v1\\.0\\.2\\.tar\\.gz\``));

	await assert.rejects(
		buildReleaseNotes({
			reportPath,
			version: '1.0.2',
			tag: 'v1.0.3',
			commit,
			runUrl,
			checksumPath,
			outputPath
		}),
		/Tag v1\.0\.3 does not match version 1\.0\.2/
	);

	const rootPackage = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'));
	const gatewayPackage = JSON.parse(
		await readFile(path.join(projectRoot, 'gateway/package.json'), 'utf8')
	);
	const gatewayLock = JSON.parse(
		await readFile(path.join(projectRoot, 'gateway/package-lock.json'), 'utf8')
	);
	assert.equal(rootPackage.version, '1.0.2');
	assert.equal(gatewayPackage.version, rootPackage.version);
	assert.equal(gatewayLock.version, rootPackage.version);
	assert.equal(gatewayLock.packages[''].version, rootPackage.version);

	const repositoryReadme = await readFile(path.join(projectRoot, 'README.md'), 'utf8');
	for (const locale of ['en', 'fr', 'hi', 'id', 'it', 'pt', 'ru', 'es', 'th']) {
		assert.ok(repositoryReadme.includes(`(\`${locale}\`)`));
	}
	assert.match(repositoryReadme, /high-quality first-pass translations without\s+native linguistic sign-off/i);
	assert.match(repositoryReadme, /not translated automatically/i);
	for (const heading of [
		'What v1.0.2 includes',
		'RAG scope',
		'Known limitations',
		'Production deployment',
		'Upgrade',
		'Rollback',
		'Uninstall',
		'Troubleshooting'
	]) {
		assert.match(repositoryReadme, new RegExp(`^## ${heading.replaceAll('.', '\\.')}$`, 'm'));
	}
	assert.match(repositoryReadme, /carbonio-ai-assistant-v1\.0\.2\.tar\.gz/);
	assert.match(repositoryReadme, /carbonio-ai-gateway\.service/);
	assert.match(
		repositoryReadme,
		/not full mailbox, attachment, file, or workspace vector RAG/i
	);
	for (const limitation of [
		'logout/login/login-again',
		'Firefox desktop and narrow-layout',
		'real non-administrator Settings boundary',
		'large-mailbox',
		'live attachment',
		'remaining calendar mutation lifecycle',
		'Carbonio upgrade rehearsal',
		'separate staging and PostgreSQL replica/failover'
	]) {
		assert.match(repositoryReadme, new RegExp(limitation, 'i'));
	}
	for (const command of ['install.sh', 'smoke-test.sh', 'rollback.sh', 'uninstall.sh']) {
		assert.match(repositoryReadme, new RegExp(command.replace('.', '\\.')));
	}
	assert.doesNotMatch(repositoryReadme, /—/);
	assert.doesNotMatch(repositoryReadme, /;/);

	const repositoryReport = await readFile(
		path.join(projectRoot, `docs/releases/v${rootPackage.version}.md`),
		'utf8'
	);
	assert.match(repositoryReport, /^# Carbonio AI Assistant v1\.0\.2/m);

	const contract = await validateRepositoryReleaseContract({
		projectRoot,
		expectedVersion: '1.0.2'
	});
	assert.equal(contract.version, '1.0.2');
	assert.equal(contract.closedBugCount, 30);

	const brokenRoot = path.join(workspace, 'broken-repository');
	const contractFiles = [
		'package.json',
		'gateway/package.json',
		'gateway/package-lock.json',
		'docs/releases/v1.0.2.md',
		'README.md',
		'CHANGELOG.md',
		'deploy/package-release.sh',
		'.github/workflows/ci.yml',
		'.github/workflows/release.yml'
	];
	for (const relativePath of contractFiles) {
		const destination = path.join(brokenRoot, relativePath);
		await mkdir(path.dirname(destination), { recursive: true });
		await cp(path.join(projectRoot, relativePath), destination);
	}
	const extendedReportPath = path.join(brokenRoot, 'docs/releases/v1.0.2.md');
	const originalReport = await readFile(extendedReportPath, 'utf8');
	await writeFile(
		extendedReportPath,
		originalReport.replace(/^## Risk acceptance\s*$/m, '## Risk record'),
		'utf8'
	);
	await assert.rejects(
		validateRepositoryReleaseContract({
			projectRoot: brokenRoot,
			expectedVersion: '1.0.2'
		}),
		/Release report is missing section: Risk acceptance/
	);
	await writeFile(extendedReportPath, originalReport, 'utf8');
	await writeFile(
		extendedReportPath,
		originalReport.replace(/^### BUG-025\b/m, '### BUG-125'),
		'utf8'
	);
	await assert.rejects(
		validateRepositoryReleaseContract({
			projectRoot: brokenRoot,
			expectedVersion: '1.0.2'
		}),
		/Release report is missing BUG-025/
	);
	await writeFile(extendedReportPath, originalReport, 'utf8');
	await writeFile(
		extendedReportPath,
		originalReport.replace(
			/(### BUG-001[\s\S]*?)- \*\*Root cause:\*\*/m,
			'$1- Root cause:'
		),
		'utf8'
	);
	await assert.rejects(
		validateRepositoryReleaseContract({
			projectRoot: brokenRoot,
			expectedVersion: '1.0.2'
		}),
		/BUG-001 is missing detail: Root cause/
	);
	await writeFile(extendedReportPath, originalReport, 'utf8');
	const extendedReport = `${await readFile(extendedReportPath, 'utf8')}\n### BUG-031 - Additional verified closure\n`;
	await writeFile(extendedReportPath, extendedReport, 'utf8');
	const extendedContract = await validateRepositoryReleaseContract({
		projectRoot: brokenRoot,
		expectedVersion: '1.0.2'
	});
	assert.equal(extendedContract.closedBugCount, 31);

	const brokenWorkflowPath = path.join(brokenRoot, '.github/workflows/release.yml');
	const brokenWorkflow = (await readFile(brokenWorkflowPath, 'utf8')).replace(
		'--notes-file release/github-release-notes.md',
		'--generate-notes'
	);
	await writeFile(brokenWorkflowPath, brokenWorkflow, 'utf8');
	await assert.rejects(
		validateRepositoryReleaseContract({
			projectRoot: brokenRoot,
			expectedVersion: '1.0.2'
		}),
		/Release workflow must publish the curated body with --notes-file/
	);

	console.log('release_report_contract=ok');
} finally {
	await rm(workspace, { recursive: true, force: true });
}
