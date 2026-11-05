// Makes the two versions of VJ Pad from one source file.
//   node source/build.mjs
// Source:  source/VJ Pad.source.html
// Output:  VJ Pad.html               (computer version: open the file in Chrome or Edge)
//          iPad website/index.html   (iPad version: put the "iPad website" folder on a website)
//
// In the source, a part that belongs to one version only sits between markers:
//   JS and CSS:  /*@computer*/ ... /*@end*/     /*@ipad*/ ... /*@end*/
//   HTML:        <!--@computer--> ... <!--@end-->   <!--@ipad--> ... <!--@end-->
// Markers cannot be nested.
import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const src = readFileSync(path.join(here, 'VJ Pad.source.html'), 'utf8');
const mark = name => `(?:/\\*@${name}\\*/|<!--@${name}-->)`;

function build(keep, drop) {
  const body = `(?:(?!${mark('end')})[\\s\\S])*?`;   // never runs past the first @end
  let s = src
    .replace(new RegExp(`^[ \\t]*${mark(drop)}${body}${mark('end')}[ \\t]*\\n`, 'gm'), '')   // whole lines
    .replace(new RegExp(`${mark(drop)}${body}${mark('end')}`, 'g'), '')                     // inside a line
    .replace(new RegExp(`^[ \\t]*(?:${mark(keep)}|${mark('end')})[ \\t]*\\n`, 'gm'), '')
    .replace(new RegExp(`${mark(keep)}|${mark('end')}`, 'g'), '');
  const left = s.match(/\/\*@\w+\*\/|<!--@\w+-->/);
  if (left) throw new Error(`A marker is left in the ${keep} version: ${left[0]}. Check that every marker has an @end.`);
  return s;
}

for (const [keep, drop, out] of [['computer', 'ipad', 'VJ Pad.html'], ['ipad', 'computer', path.join('iPad website', 'index.html')]]) {
  const html = build(keep, drop);
  writeFileSync(path.join(root, out), html);
  console.log(`${out}: ${(html.length / 1024).toFixed(0)} KB`);
}
