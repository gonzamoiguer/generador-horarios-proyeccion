// Build sin dependencias: copia el sitio estático a dist/.
import { rm, mkdir, cp } from 'node:fs/promises';

const out = new URL('../dist/', import.meta.url);
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(new URL('../index.html', import.meta.url), new URL('index.html', out));
await cp(new URL('../src/', import.meta.url), new URL('src/', out), { recursive: true });
console.log('Build listo en dist/');
