import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const SEMVER_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const CHECKSUM_PATTERN = /^[0-9a-f]{64} {2}\S+$/;

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
