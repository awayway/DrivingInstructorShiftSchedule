import { readFileSync, writeFileSync } from 'fs';

const tag = 'di' + 'v';
const files = ['src/compareUi.js', 'src/main.js'];

for (const path of files) {
  let t = readFileSync(path, 'utf8');
  const bad = "createElement('motion')";
  const good = `createElement('${tag}')`;
  const n = (t.split(bad).length - 1);
  t = t.split(bad).join(good);
  writeFileSync(path, t);
  console.log(path, 'fixed', n);
}
