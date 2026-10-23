import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import assert from 'node:assert/strict';
const root = process.cwd();
function files(dir) {
    return fs
        .readdirSync(dir, { withFileTypes: true })
        .flatMap((entry) =>
            entry.isDirectory()
                ? files(path.join(dir, entry.name))
                : entry.name.endsWith('.js')
                  ? [path.join(dir, entry.name)]
                  : [],
        );
}
const all = [
    path.join(root, 'index.js'),
    ...files(path.join(root, 'src')),
    ...files(path.join(root, 'txtToWorldbook')),
];
// UI-coupled adapters now live in txtToWorldbook/ui; no service exceptions remain.
const DOM_SERVICE_ALLOWLIST = new Set();
const DOM_IDENTIFIERS = new Set(['document', 'window', 'jQuery', 'ModalFactory']);
const graph = new Map();
for (const file of all) {
    const relative = path.relative(root, file).replaceAll('\\', '/');
    const source = ts.createSourceFile(
        file,
        fs.readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.JS,
    );
    const imports = [];
    function visit(node) {
        const specifier =
            ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
                ? node.moduleSpecifier
                : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
                  ? node.arguments[0]
                  : null;
        if (specifier && ts.isStringLiteral(specifier)) {
            const name = specifier.text;
            if (name.startsWith('/'))
                assert.ok(relative.startsWith('src/host/'), `${relative}: absolute host import ${name}`);
            else {
                assert.ok(name.startsWith('.'), `${relative}: runtime bare import ${name}`);
                const target = path.resolve(path.dirname(file), name);
                assert.ok(fs.existsSync(target), `${relative}: missing import ${name}`);
                imports.push(target);
            }
        }
        if (
            (/^src\/worldbook\/(commands|entries|processing|formats)\//.test(relative) ||
                relative.startsWith('txtToWorldbook/services/')) &&
            ts.isIdentifier(node) &&
            DOM_IDENTIFIERS.has(node.text) &&
            !DOM_SERVICE_ALLOWLIST.has(relative)
        )
            throw new Error(`${relative}: UI dependency ${node.text}`);
        ts.forEachChild(node, visit);
    }
    visit(source);
    graph.set(file, imports);
}
const visited = new Set(),
    active = new Set();
function walk(file, chain = []) {
    assert.ok(!active.has(file), `Import cycle: ${[...chain, file].map((p) => path.relative(root, p)).join(' -> ')}`);
    if (visited.has(file)) return;
    active.add(file);
    for (const target of graph.get(file) || []) walk(target, [...chain, file]);
    active.delete(file);
    visited.add(file);
}
for (const file of all) walk(file);
const mainLines = fs.readFileSync(path.join(root, 'txtToWorldbook/main.js'), 'utf8').split('\n').length;
assert.ok(mainLines <= 200, `txtToWorldbook/main.js: ${mainLines} lines exceeds the 200-line budget`);
console.log(
    `Checked ${all.length} runtime modules: imports, host isolation, DOM-free worldbook commands and cycles passed; main.js ${mainLines} lines.`,
);
