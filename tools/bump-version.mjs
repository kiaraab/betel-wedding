// Run before every push that changes js/ or styles.css:   node tools/bump-version.mjs
// Gives every script and the stylesheet a new ?v=<build> address in index.html (the import map covers all js/*.js), so a phone can never mix
// an old cached file with a new one: it loads either the whole old set or the whole new set.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, 'index.html');
let html = readFileSync(file, 'utf8');
const id = new Date().toISOString().replace(/\D/g, '').slice(0, 12);
html = html.replace(/styles\.css(\?v=[\w.-]*)?/, `styles.css?v=${id}`);
const imports = {
  three: 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js',
  'three/addons/': 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/',
};
readdirSync(join(root, 'js')).filter((f) => f.endsWith('.js')).sort().forEach((f) => { imports[`./js/${f}`] = `./js/${f}?v=${id}`; });
const block = `<script type="importmap">\n    ${JSON.stringify({ imports }, null, 2).replace(/\n/g, '\n    ')}\n  </script>`;
if (!/<script type="importmap">[\s\S]*?<\/script>/.test(html)) throw new Error('import map not found in index.html');
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>/, block);
writeFileSync(file, html);
console.log(`build ${id}: stylesheet + ${Object.keys(imports).length - 2} scripts versioned`);
