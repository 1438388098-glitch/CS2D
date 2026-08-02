import { readFileSync, writeFileSync } from 'fs';
let s = readFileSync('D:/Claudeworkspace/CS2D/test/cdp-test.mjs', 'utf8');
if (s.includes('mmPix')) {
  console.log('already patched, skip');
  process.exit(0);
}
const anchor = 'const aim = await cdp.eval(';
const expr = "(()=>{const c=document.querySelector('canvas');if(!c)return 'no-canvas';const d=c.getContext('2d').getImageData(c.width-250,8,20,20).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i]+d[i+1]+d[i+2]>30)n++;return n>15?'minimap-ok':('pixels='+n)})()";
const insert = "const mmPix = await cdp.eval(" + JSON.stringify(expr) + ");\n  pass('minimap render: ' + mmPix);\n\n  const aim = await cdp.eval(";
s = s.replace(anchor, insert);
writeFileSync('D:/Claudeworkspace/CS2D/test/cdp-test.mjs', s);
console.log('patched');
