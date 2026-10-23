import assert from 'node:assert/strict';
import fs from 'node:fs';

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');

assert.equal(manifest.version, packageJson.version, 'manifest.json 与 package.json 版本不一致');
assert.equal(lock.packages?.['']?.version, packageJson.version, 'package-lock 根版本与 package.json 不一致');
const escapedVersion = packageJson.version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
assert.match(changelog, new RegExp(`^## ${escapedVersion}`, 'm'), 'CHANGELOG 缺少当前版本章节');
console.log(`Version check passed: ${packageJson.version}`);
