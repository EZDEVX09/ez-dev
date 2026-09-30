#!/usr/bin/env node
// Runs all four products locally on http://localhost:8787-8790 with a SQLite database,
// no Cloudflare account needed.
//
//   npm run dev                              uses ANTHROPIC_API_KEY if set
//   EZ_DEMO_AI=1 npm run dev                 fake AI output (no key, no cost)
//   EZ_DB=./local.sqlite npm run dev         keep data between restarts

import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { createStack, PORTS, installFetchMock, claudeWriteFiles } from '../test/harness.mjs';

const demo = process.env.EZ_DEMO_AI === '1' || !process.env.ANTHROPIC_API_KEY;
const stack = await createStack({
  dbPath: process.env.EZ_DB || ':memory:',
  extraEnv: {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || 'demo',
    ALLOW_PRIVATE_TARGETS: process.env.ALLOW_PRIVATE_TARGETS || 'false',
  },
});

const realFetch = globalThis.fetch;
if (demo) {
  installFetchMock(async (req) => {
    if (new URL(req.url).hostname !== 'api.anthropic.com') return realFetch(req);
    const body = await req.json();
    const ask = /(?:from scratch:|change:)\n([\s\S]*?)\n\n/.exec(body.messages[0].content)?.[1] || 'Demo project';
    const isSite = /EZ SITE/.test(body.system);
    const title = ask.split(/[.\n]/)[0].slice(0, 60);
    const page = (h1, extra = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${h1}</title><link rel="stylesheet" href="styles.css"></head><body><header><strong>${title}</strong>${isSite ? '<nav><a href="index.html">Home</a> <a href="about.html">About</a></nav>' : ''}</header><main><h1>${h1}</h1><p>Demo output (EZ_DEMO_AI). Add an ANTHROPIC_API_KEY to generate the real thing.</p>${extra}</main><script src="app.js"></script></body></html>`;
    const files = [
      { path: 'index.html', content: page(title, '<button id="b">Click me</button> <span id="n">0</span>') },
      { path: 'styles.css', content: 'body{font-family:system-ui;margin:0;background:#f6f4ee;color:#1b1d22}header{display:flex;justify-content:space-between;padding:16px 24px;background:#1b1d22;color:#fff}header a{color:#c6f24e;margin-left:12px}main{padding:48px 24px;max-width:720px;margin:auto}h1{font-size:44px;line-height:1.1}button{font:inherit;padding:10px 18px;border-radius:10px;border:0;background:#1b1d22;color:#fff}' },
      { path: 'app.js', content: 'let n=0;const b=document.getElementById("b");if(b)b.onclick=()=>{document.getElementById("n").textContent=++n};' },
      ...(isSite ? [{ path: 'about.html', content: page('About us') }] : []),
    ];
    await new Promise((r) => setTimeout(r, 800));
    return claudeWriteFiles(`Built “${title}” (demo mode).`, files);
  });
}

for (const [key, port] of Object.entries(PORTS)) {
  createServer(async (req, res) => {
    try {
      const url = `http://localhost:${port}${req.url}`;
      const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : Readable.toWeb(req);
      const request = new Request(url, { method: req.method, headers: req.headers, body, duplex: 'half' });
      const out = await stack.apps[key].fetch(request);
      const headers = {};
      out.headers.forEach((v, k) => { if (k !== 'set-cookie') headers[k] = v; });
      const cookies = out.headers.getSetCookie();
      if (cookies.length) headers['set-cookie'] = cookies;
      res.writeHead(out.status, headers);
      if (out.body) for await (const chunk of out.body) res.write(chunk);
      res.end();
    } catch (e) {
      console.error(e);
      res.writeHead(500).end('dev server error');
    }
  }).listen(port, () => console.log(`${key.padEnd(11)} http://localhost:${port}`));
}
console.log(demo ? 'AI builder: demo mode (fake output)' : 'AI builder: using ANTHROPIC_API_KEY');
