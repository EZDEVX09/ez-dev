// Realistic demo content for marketing screenshots: what the AI "generates" and what
// EZ DEFENDER "finds". All businesses and domains are fictional (.example is reserved).

export const HABIT_APP = [
  { path: 'index.html', content: `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Streaks — habit tracker</title><link rel="stylesheet" href="styles.css"></head>
<body>
<main class="app">
  <header class="top">
    <div><p class="eyebrow">Tuesday, Sep 29</p><h1>Today</h1></div>
    <div class="ring" aria-label="3 of 5 habits done"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="18"/><circle class="fill" cx="22" cy="22" r="18" stroke-dasharray="68 113"/></svg><span>3/5</span></div>
  </header>
  <ul class="habits" id="habits"></ul>
  <form class="add" id="add"><label class="sr" for="new">New habit</label><input id="new" placeholder="Add a habit…" maxlength="40"><button>Add</button></form>
  <section class="week"><h2>Last 4 weeks</h2><div class="grid" id="grid"></div></section>
</main>
<script src="app.js"></script>
</body></html>` },
  { path: 'styles.css', content: `*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#ffffff;color:#0a0a0a}
.app{max-width:760px;margin:0 auto;padding:40px 24px}
.top{display:flex;justify-content:space-between;align-items:center;margin-bottom:28px}
.eyebrow{margin:0;color:#555555;font-size:14px;letter-spacing:.04em;text-transform:uppercase}
h1{margin:4px 0 0;font-size:44px;letter-spacing:-.02em}h2{font-size:18px;margin:0 0 14px}
.ring{position:relative;width:72px;height:72px}.ring svg{width:72px;height:72px;transform:rotate(-90deg)}
.ring circle{fill:none;stroke:#e5e5e5;stroke-width:5}.ring .fill{stroke:#0a0a0a;stroke-linecap:round}
.ring span{position:absolute;inset:0;display:grid;place-items:center;font-weight:700}
.habits{list-style:none;margin:0 0 20px;padding:0;display:grid;gap:12px}
.habit{display:flex;align-items:center;gap:16px;background:#fff;border-radius:16px;padding:16px 18px;box-shadow:0 1px 0 #e5e5e5}
.check{width:32px;height:32px;border-radius:50%;border:2px solid #999999;background:none;cursor:pointer;display:grid;place-items:center;flex-shrink:0}
.check.on{background:#0a0a0a;border-color:#0a0a0a;color:#fff}
.habit .name{flex:1;font-weight:600;font-size:17px}.habit .streak{font-size:14px;color:#555555}
.habit .streak b{color:#0a0a0a}
.add{display:flex;gap:10px;margin-bottom:36px}.add input{flex:1;font:inherit;padding:14px 16px;border-radius:12px;border:1px solid #cccccc;background:#fff}
.add button{font:inherit;font-weight:600;padding:0 22px;border-radius:12px;border:0;background:#0a0a0a;color:#fff}
.week{background:#fff;border-radius:16px;padding:20px}.grid{display:grid;grid-template-columns:repeat(14,1fr);gap:6px}
.grid i{aspect-ratio:1;border-radius:5px;background:#eeeeee}.grid i.l1{background:#d4d4d4}.grid i.l2{background:#8a8a8a}.grid i.l3{background:#0a0a0a}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}` },
  { path: 'app.js', content: `const habits=[{n:'Morning run',s:12,on:true},{n:'Read 20 pages',s:31,on:true},{n:'Drink 8 glasses of water',s:5,on:true},{n:'Meditate',s:3,on:false},{n:'No phone after 10pm',s:0,on:false}];
const list=document.getElementById('habits');
function render(){list.innerHTML='';habits.forEach((h,i)=>{const li=document.createElement('li');li.className='habit';
li.innerHTML='<button class="check'+(h.on?' on':'')+'" aria-label="Mark '+h.n+' done">'+(h.on?'✓':'')+'</button><span class="name"></span><span class="streak">'+(h.s?'<b>'+h.s+'</b>-day streak':'Start today')+'</span>';
li.querySelector('.name').textContent=h.n;li.querySelector('button').onclick=()=>{h.on=!h.on;h.s+=h.on?1:-1;render()};list.appendChild(li)})}
render();const g=document.getElementById('grid');for(let i=0;i<28;i++){const c=document.createElement('i');const r=(i*7+3)%10;c.className=r>7?'l3':r>4?'l2':r>2?'l1':'';g.appendChild(c)}
document.getElementById('add').onsubmit=e=>{e.preventDefault();const v=document.getElementById('new');if(v.value.trim()){habits.push({n:v.value.trim(),s:0,on:false});v.value='';render()}};` },
];

const BAKERY_CSS = `*{box-sizing:border-box}body{margin:0;font-family:Georgia,'Times New Roman',serif;background:#ffffff;color:#0a0a0a}
a{color:inherit}.nav{display:flex;justify-content:space-between;align-items:center;padding:22px 6vw;border-bottom:1px solid #dddddd}
.logo{font-size:24px;font-weight:700;letter-spacing:-.01em}.logo span{color:#0a0a0a}
.nav ul{display:flex;gap:28px;list-style:none;margin:0;padding:0;font-family:system-ui,sans-serif;font-size:15px}.nav a{text-decoration:none}.nav a[aria-current]{border-bottom:2px solid #0a0a0a}
.hero{display:grid;grid-template-columns:1.1fr .9fr;gap:5vw;align-items:center;padding:8vh 6vw}
.hero h1{font-size:clamp(40px,6vw,76px);line-height:1;margin:0 0 20px;letter-spacing:-.02em}.hero p{font-family:system-ui,sans-serif;font-size:19px;line-height:1.6;color:#555555;max-width:520px}
.btn{display:inline-block;margin-top:14px;padding:14px 26px;border-radius:999px;background:#0a0a0a;color:#ffffff;text-decoration:none;font-family:system-ui,sans-serif;font-weight:600}
.loaf{aspect-ratio:1;border-radius:48% 52% 45% 55%;background:#1a1a1a;position:relative;box-shadow:inset -30px -30px 0 #000000}
.loaf::before,.loaf::after{content:'';position:absolute;height:14px;border-radius:8px;background:#ffffff;left:22%;right:22%}.loaf::before{top:38%;transform:rotate(-14deg)}.loaf::after{top:56%;transform:rotate(-14deg)}
.strip{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;padding:0 6vw 10vh;font-family:system-ui,sans-serif}
.strip div{background:#fff;border-radius:18px;padding:26px;border:1px solid #dddddd}.strip h3{font-family:Georgia,serif;font-size:22px;margin:0 0 8px}.strip p{margin:0;color:#555555;line-height:1.5}
@media(max-width:720px){.hero{grid-template-columns:1fr}.loaf{max-width:260px}.strip{grid-template-columns:1fr}.nav ul{gap:14px;font-size:14px}}`;

const bakeryPage = (current, main) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Crumb &amp; Crust Bakery</title><meta name="description" content="Slow-fermented sourdough and pastries, baked fresh every morning."><link rel="stylesheet" href="styles.css"></head><body>
<header class="nav"><a class="logo" href="index.html">Crumb <span>&amp;</span> Crust</a><nav><ul>
${[['index.html', 'Home'], ['menu.html', 'Menu'], ['about.html', 'Our story'], ['contact.html', 'Visit']].map(([h, l]) => `<li><a href="${h}"${h === current ? ' aria-current="page"' : ''}>${l}</a></li>`).join('')}
</ul></nav></header>${main}</body></html>`;

export const BAKERY_SITE = [
  { path: 'index.html', content: bakeryPage('index.html', `<main><section class="hero"><div><h1>Bread worth waking up for.</h1>
<p>Naturally leavened sourdough, laminated pastries and seasonal bakes, shaped by hand and fermented for 36 hours.</p>
<a class="btn" href="menu.html">See today’s bakes</a></div><div class="loaf" role="img" aria-label="Illustration of a sourdough loaf"></div></section>
<section class="strip"><div><h3>Slow fermented</h3><p>36 hours from starter to oven for flavour and easy digestion.</p></div>
<div><h3>Baked at dawn</h3><p>Everything on the shelf was made this morning.</p></div>
<div><h3>Pre-order pickup</h3><p>Reserve loaves the night before: [ordering details].</p></div></section></main>`) },
  { path: 'menu.html', content: bakeryPage('menu.html', '<main class="hero"><h1>Menu</h1></main>') },
  { path: 'about.html', content: bakeryPage('about.html', '<main class="hero"><h1>Our story</h1></main>') },
  { path: 'contact.html', content: bakeryPage('contact.html', '<main class="hero"><h1>Visit us</h1><p>[Your address] · [Opening hours]</p></main>') },
  { path: 'styles.css', content: BAKERY_CSS },
];

const simple = (title) => [
  { path: 'index.html', content: `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><link rel="stylesheet" href="styles.css"></head><body><h1>${title}</h1></body></html>` },
  { path: 'styles.css', content: 'body{font-family:system-ui;padding:40px}' },
];

/** Picks what the fake AI returns based on the request text. */
export function fakeGeneration(prompt, isSite) {
  const p = prompt.toLowerCase();
  if (p.includes('habit')) return { summary: 'Built “Streaks”, a habit tracker with daily check-offs, streak counts, a progress ring and a 4-week heatmap. Your habits are kept on this device.', files: HABIT_APP };
  if (p.includes('stand out')) return { summary: 'Made the streak counts bold so they stand out against the list.', files: HABIT_APP };
  if (p.includes('bakery')) return { summary: 'Built a 4-page site for Crumb & Crust: home, menu, our story and visit pages, with a shared header and a warm, hand-made look.', files: BAKERY_SITE };
  if (isSite) return { summary: 'Built your site.', files: simple(prompt.slice(0, 40)) };
  return { summary: 'Built your app.', files: simple(prompt.slice(0, 40)) };
}

// ---------- EZ DEFENDER targets ----------

const good = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'",
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Permissions-Policy': 'camera=(), microphone=()',
};

export const TARGETS = {
  'portfolio.example': { headers: good, body: '<html><body>Portfolio</body></html>', https: true },
  'shop.example': {
    https: true,
    headers: { 'Strict-Transport-Security': 'max-age=86400', 'X-Content-Type-Options': 'nosniff', Server: 'nginx/1.18.0', 'Set-Cookie': 'cart=abc123; Path=/' },
    body: '<html><head><script src="https://cdn.example-cdn.example/jquery-3.3.1.min.js"></script></head><body><img src="http://images.shop.example/hero.jpg">Shop</body></html>',
  },
  'blog.example': {
    https: false,
    headers: { Server: 'Apache/2.4.29 (Ubuntu)', 'X-Powered-By': 'PHP/7.2.24' },
    body: '<html><head><meta name="generator" content="WordPress 5.4.2"></head><body><form action="http://blog.example/wp-login.php"></form></body></html>',
    exposed: { '/.git/HEAD': 'ref: refs/heads/master\n' },
  },
};

export const DNS = {
  'portfolio.example|TXT': [{ type: 16, data: '"v=spf1 include:_spf.mail.example -all"' }],
  '_dmarc.portfolio.example|TXT': [{ type: 16, data: '"v=DMARC1; p=reject"' }],
  'portfolio.example|CAA': [{ type: 257, data: '0 issue "letsencrypt.org"' }],
  'shop.example|TXT': [{ type: 16, data: '"v=spf1 include:_spf.mail.example ~all"' }],
  '_dmarc.shop.example|TXT': [{ type: 16, data: '"v=DMARC1; p=none"' }],
  'shop.example|MX': [{ type: 15, data: '10 mx.mail.example.' }],
  'blog.example|MX': [{ type: 15, data: '10 mx.mail.example.' }],
};
