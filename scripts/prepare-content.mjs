import fs from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'public');
const origin = 'https://mbrace-insight.niceshark22.chatgpt.site';
const content = JSON.parse(await fs.readFile(path.join(root, 'content/field-notes.json'), 'utf8'));
let home = await fs.readFile(path.join(dist, 'index.html'), 'utf8');
const figures = JSON.parse(await fs.readFile(path.join(root, 'content/briefing-20814.json'), 'utf8'));
const titleCase = s => s.replace(/(^|[\s\/(])([a-z])/g, (_, p, c) => p + c.toUpperCase()).replace(/ (And|Or|Of) /g, w => w.toLowerCase());
function figure(key) {
  if (key === 'unmatched_count') return figures.unmatched.length;
  if (key.startsWith('use.')) {
    const [, rest] = key.split(/^use\./);
    const field = rest.slice(rest.lastIndexOf('.') + 1);
    const row = figures.by_use.find(u => u.use === rest.slice(0, rest.lastIndexOf('.')));
    return row?.[field];
  }
  return key.split('.').reduce((value, part) => value?.[part], figures);
}
const byUseTable = () => `<div class="data-table-wrap"><table class="data-table"><thead><tr><th scope="col">Use type</th><th scope="col">Records</th><th scope="col">Yes</th><th scope="col">No</th><th scope="col">Undisclosed</th></tr></thead><tbody>${figures.by_use.map(u => `<tr><th scope="row">${escape(titleCase(u.use))}</th><td>${u.records}</td><td>${u.yes}</td><td>${u.no}</td><td>${u.undisclosed}</td></tr>`).join('')}</tbody><tfoot><tr><th scope="row">Total</th><td>${figures.matched}</td><td>${figures.interim.yes}</td><td>${figures.interim.no}</td><td>${figures.interim.undisclosed}</td></tr></tfoot></table></div>`;
const fill = html => html.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
  if (key === 'TABLE:by_use') return byUseTable();
  const value = figure(key);
  if (value === undefined || value === null || typeof value === 'object') throw new Error(`Unresolved briefing figure: ${key}`);
  return escape(String(value));
});
const escape = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const organization = {
  '@type': 'Organization', '@id': `${origin}/#organization`, name: 'MBRACE INSIGHT',
  url: `${origin}/`, email: 'mfisher@mbraceinsight.com', areaServed: ['Washington, DC', 'Maryland', 'Virginia']
};
for (const [key, a] of Object.entries(content)) {
  const url = origin + a.path;
  const body = fill(a.body).replace(/<h3( [^>]*)?>/g, (_, attrs = '') => `<h2${attrs}>`).replaceAll('</h3>', '</h2>');
  const editorial = !['privacy','editorial'].includes(key);
  const article = {
    '@type': editorial ? 'Article' : 'WebPage', '@id': url + '#content', url,
    ...(editorial ? {headline: a.title} : {name: a.title}),
    author: {'@type':'Person', name:a.author, '@id':`${origin}/#publisher`},
    publisher: {'@id':organization['@id']}, inLanguage:'en-US',
    creativeWorkStatus:'Draft', ...(editorial ? {datePublished:a.date} : {})
  };
  const schema = JSON.stringify({'@context':'https://schema.org','@graph':[organization, article]}).replaceAll('<','\\u003c');
  const header = home.match(/<header class="site-header">[\s\S]*?<\/header>/)[0]
    .replaceAll('href="#', 'href="/#');
  const footer = home.match(/<footer class="site-footer">[\s\S]*?<\/footer>/)[0]
    .replaceAll('href="#', 'href="/#');
  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#f6f6ef"><meta name="robots" content="noindex, nofollow"><meta name="description" content="${escape(a.description || a.title + ' — an MBRACE INSIGHT educational draft for DMV residents.')}"/><title>${escape(a.title)} | MBRACE INSIGHT</title><link rel="canonical" href="${url}"><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/styles.css"><script type="application/ld+json">${schema}</script><script src="/article-page.js" defer></script></head><body><a class="skip-link" href="#main">Skip to content</a>${header}<main id="main" class="article-page container"><a class="text-link" href="/#briefing">← Back to MBRACE INSIGHT</a><article><div class="eyebrow">${escape(a.category)}</div><h1>${escape(a.title)}</h1><p class="article-byline">By ${escape(a.author)} · ${escape(a.editorialStatus)} · <time datetime="${a.date}">${a.date}</time></p><div class="article-body">${body}</div></article><aside class="article-next"><h2>Get the next county finding.</h2><p>Each issue of the Montgomery County edition leads with one finding from the public record, with its source and date. Newsletter signup is a separate choice from any download.</p><a class="button button-dark" href="/#newsletter">Get the county edition <span aria-hidden="true">↗</span></a></aside></main>${footer}</body></html>`;
  const directory = path.join(dist, a.path);
  await fs.mkdir(directory,{recursive:true});
  await fs.writeFile(path.join(directory,'index.html'),page);
}
const resources = JSON.parse(await fs.readFile(path.join(root,'content/resources.json'),'utf8'));
const metadata = JSON.stringify(resources.filter(r => r.featured).map(({id,title,category,description,format,tag,cover,featured}) => ({id,title,category,description,format,tag,cover,featured}))).replaceAll('<','\\u003c');
home = home.replace(/<script id="resources-metadata" type="application\/json">[\s\S]*?<\/script>/, `<script id="resources-metadata" type="application/json">${metadata}</script>`);
await fs.writeFile(path.join(dist, 'index.html'), home);
for (const resource of resources) {
  const route = `/resources/${resource.id}/`;
  const url = origin+route;
  const header = home.match(/<header class="site-header">[\s\S]*?<\/header>/)[0].replaceAll('href="#','href="/#');
  const footer = home.match(/<footer class="site-footer">[\s\S]*?<\/footer>/)[0].replaceAll('href="#','href="/#');
  const schema = JSON.stringify({'@context':'https://schema.org','@graph':[organization,{'@type':'WebPage',url,name:resource.title,publisher:{'@id':organization['@id']},author:{'@type':'Person',name:'Max Fisher'}}]}).replaceAll('<','\\u003c');
  const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="description" content="${escape(resource.description)}"><title>${escape(resource.title)} | MBRACE INSIGHT</title><link rel="canonical" href="${url}"><link rel="stylesheet" href="/styles.css"><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><script type="application/ld+json">${schema}</script><script src="/capture.js" defer></script></head><body>${header}<main id="main" class="article-page container"><a class="text-link" href="/#resources">← Back to the resource library</a><article><div class="eyebrow">${escape(resource.category)} / ${escape(resource.format)}</div><h1>${escape(resource.title)}</h1><p class="article-byline">By Max Fisher · MBRACE INSIGHT · Draft resource for review</p><div class="article-body"><p>${escape(resource.description)}</p><p>${escape(resource.note || (resource.featured ? "Use this editable guide to prepare useful questions. It does not approve a rebate, design a system, or certify building compliance." : "This is a retained preparation resource from an earlier draft. It is not a completed assessment or issued certification."))}</p></div></article><div class="resource-page-form"><h2>Get your download.</h2><form class="capture-form" data-capture-form method="post" action="/api/capture"><input type="hidden" name="type" value="resource"><input type="hidden" name="asset" value="${resource.id}"><input type="hidden" name="source" value="resource-${resource.id}"><label for="asset-email">Your email<input id="asset-email" name="email" type="email" maxlength="254" autocomplete="email" required placeholder="you@example.com"></label><div class="honeypot" aria-hidden="true"><label>Leave this empty<input name="company_website" tabindex="-1" autocomplete="off"></label></div><label class="consent-choice optional-consent"><input type="checkbox" name="newsletter_opt_in"><span>Also send me the MBRACE INSIGHT newsletter. I can unsubscribe at any time.</span></label><button type="submit" class="button button-dark">Unlock my download ↓</button><p class="capture-privacy">We use your email to handle this resource request. Newsletter signup is optional. <a href="/privacy/">Privacy</a>.</p><p class="form-error" hidden role="alert"></p></form><div class="capture-result" hidden tabindex="-1" aria-live="polite"></div></div></main>${footer}</body></html>`;
  const directory = path.join(dist,route);await fs.mkdir(directory,{recursive:true});await fs.writeFile(path.join(directory,'index.html'),page);
}
await fs.writeFile(path.join(dist,'field-notes.json'),JSON.stringify(content)+'\n');
const urls = [`${origin}/`,...Object.values(content).map(a=>origin+a.path),...resources.filter(r=>r.featured).map(r=>origin+`/resources/${r.id}/`)];
await fs.writeFile(path.join(dist,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(url=>`  <url><loc>${url}</loc></url>`).join('\n')}\n</urlset>\n`);
// The private draft must stay private and noindex. Public release requires a separate live scan.
await fs.writeFile(path.join(dist,'robots.txt'),`# Owner-private review build. Not eligible for public indexing.\nUser-agent: *\nDisallow: /\n\nSitemap: ${origin}/sitemap.xml\n`);
console.log(`Prepared editorial pages, ${resources.length} resource pages, and discovery files.`);
