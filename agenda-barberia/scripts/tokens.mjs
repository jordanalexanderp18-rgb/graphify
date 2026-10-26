// Genera public/css/tokens.css a partir de replica/design/tokens.json.
// Uso: node scripts/tokens.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const t = JSON.parse(readFileSync(new URL('../replica/design/tokens.json', import.meta.url)));
const lines = [':root {'];
for (const [k, v] of Object.entries(t.color)) lines.push(`  --c-${k}: ${v};`);
lines.push(`  --font-sans: ${t.font.sans};`, `  --font-mono: ${t.font.mono};`);
for (const [k, v] of Object.entries(t.type)) {
  lines.push(`  --fs-${k}: ${v.size / 16}rem;`, `  --lh-${k}: ${v.line / 16}rem;`, `  --fw-${k}: ${v.weight};`);
}
t.space.forEach((v, i) => lines.push(`  --s-${i}: ${v / 16}rem;`));
for (const [k, v] of Object.entries(t.radius)) lines.push(`  --r-${k}: ${v}px;`);
for (const [k, v] of Object.entries(t.shadow)) lines.push(`  --shadow-${k}: ${v};`);
for (const [k, v] of Object.entries(t.motion)) lines.push(`  --motion-${k}: ${v};`);
for (const [k, v] of Object.entries(t.layout)) lines.push(`  --layout-${k}: ${v}px;`);
lines.push('}');
writeFileSync(new URL('../public/css/tokens.css', import.meta.url),
  '/* Generado por scripts/tokens.mjs desde replica/design/tokens.json. No editar a mano. */\n' + lines.join('\n') + '\n');
console.log('tokens.css escrito');
