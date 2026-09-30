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
            /^src\/worldbook\/(commands|entries|processing|formats)\//.test(relative) &&
            ts.isIdentifier(node) &&
            ['document', 'window', 'jQuery', 'ModalFactory'].includes(node.text)
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
console.log(
    `Checked ${all.length} runtime modules: imports, host isolation, DOM-free worldbook commands and cycles passed.`,
);
