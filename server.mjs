import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const root = resolve('dist');
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
const port = Number(process.env.PORT || 4173);
createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const path = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (path !== root && !path.startsWith(root + sep)) throw new Error('Invalid path');
    const content = await readFile(path);
    response.writeHead(200, {'content-type':types[extname(path)] || 'application/octet-stream'});
    response.end(content);
  } catch { response.writeHead(404); response.end('Not found'); }
}).listen(port, () => console.log(`Ordna: http://localhost:${port}`));
