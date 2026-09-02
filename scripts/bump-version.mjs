import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const BADGE_RE = /version-v\d+\.\d+\.\d+-blue/g;
const CHANGELOG_HEADER_RE = /^# \[/m;

const newVersion = process.argv[2];

if (!newVersion) {
    console.error('Usage: node scripts/bump-version.mjs <version>');
    console.error('Example: node scripts/bump-version.mjs 0.10.0');
    process.exit(1);
}

if (!SEMVER_RE.test(newVersion)) {
    console.error(`Invalid version format: "${newVersion}". Expected semver (e.g. 0.10.0).`);
    process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const updated = [];

async function bumpPackageJson() {
    const p = resolve(root, 'package.json');
    const raw = JSON.parse(await readFile(p, 'utf8'));
    raw.version = newVersion;
    await writeFile(p, JSON.stringify(raw, null, 2) + '\n', 'utf8');
    updated.push(`package.json → ${newVersion}`);
}

async function bumpReadme(filename) {
    const p = resolve(root, filename);
    const raw = await readFile(p, 'utf8');
    const next = raw.replace(BADGE_RE, `version-v${newVersion}-blue`);
    if (next !== raw) {
        await writeFile(p, next, 'utf8');
        updated.push(`${filename} → badge v${newVersion}`);
    }
}

async function bumpChangelog() {
    const p = resolve(root, 'CHANGELOG.md');
    const raw = await readFile(p, 'utf8');
    const placeholder =
        `# [${newVersion}] - ${today}\n\n` +
        `### Added\n- \n\n` +
        `### Changed\n- \n\n` +
        `### Fixed\n- \n\n`;

    let next;
    if (CHANGELOG_HEADER_RE.test(raw)) {
        next = raw.replace(CHANGELOG_HEADER_RE, placeholder + '# [');
    } else {
        next = raw + '\n' + placeholder;
    }
    await writeFile(p, next, 'utf8');
    updated.push(`CHANGELOG.md → inserted [# [${newVersion}]]`);
}

await bumpPackageJson();
await bumpReadme('README.md');
await bumpReadme('README.zh-TW.md');
await bumpChangelog();

console.log(`✅ Bumped to v${newVersion}:`);
for (const line of updated) {
    console.log(`  • ${line}`);
}
