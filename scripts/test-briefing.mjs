// Checks that every figure the edition publishes matches content/briefing-20814.json
// (built from the county exports), and that the 20814 data sheet goes through the
// existing consent-separated download flow.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { webcrypto, randomUUID } from 'node:crypto';
import { localDatabase } from './local-db.mjs';
globalThis.crypto ||= webcrypto;
const root = path.resolve(import.meta.dirname, '..');
const f = JSON.parse(await fs.readFile(path.join(root, 'content/briefing-20814.json'), 'utf8'));
const app = (await import(pathToFileURL(path.join(root, 'dist/server/index.js')).href)).default;
const db = localDatabase(path.resolve(root, `../../work/briefing-test-${randomUUID()}.sqlite`));
await db.migrate();
const origin = 'https://site.test';
const env = { DB: db, ADMIN_EMAIL: 'owner@example.invalid', SITE_ORIGIN: origin };
const get = async route => { const r = await app.fetch(new Request(origin + route), env, {}); assert.equal(r.status, 200, route); return r.text(); };
const use = name => f.by_use.find(u => u.use === name);
const plain = html => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

const home = plain(await get('/'));
const mf = use('multifamily housing'), hotel = use('hotel'), office = use('office');
const homeClaims = [
  `${f.matched} matched buildings.`, `${f.interim.no} marked “No.”`,
  `${f.interim.no} of ${f.matched} matched 20814 buildings`, `${f.interim.yes} read Yes; ${f.interim.undisclosed} read Undisclosed`,
  `${mf.no} of ${mf.records} multifamily buildings read No`, `all ${hotel.records} hotels`,
  `${office.no} of ${office.records} office buildings read No. ${office.yes} read Yes.`,
  `${f.interim_no_and_report_in_compliance} of those ${f.interim.no} buildings`,
  `Three ${f.zip} inventory records have no energy map match`,
  `${f.eui_blank} have no normalized site EUI and ${f.eui_undisclosed} read “Undisclosed.”`,
  `issued ${f.permits.county} mechanical permits in October; ${f.permits.zip} list ${f.zip} (${f.permits.worktype.REPLACE} replacements, ${f.permits.worktype.INSTALL} installs)`,
  `All ${f.inventory_in_zip} inventory records`
];
assert.equal(f.unmatched.length, 3, 'Homepage copy says "Three"; update it if the unmatched count changes.');
assert.equal(hotel.no, hotel.records, 'Homepage copy says "all 6 hotels"; update it if any hotel reads Yes.');
for (const claim of homeClaims) assert.ok(home.includes(claim), `Homepage figure missing or stale: ${claim}`);
assert.match(await get('/'), /<meta name="robots" content="noindex,nofollow">/);

const briefingHTML = await get('/montgomery-county/20814/beps-briefing/');
assert.doesNotMatch(briefingHTML, /\{\{|\}\}/, 'Unresolved template token in briefing');
const briefing = plain(briefingHTML);
for (const claim of [
  `the county marks ${f.interim.no} of ${f.matched} buildings`, `lists ${f.interim.no} of the ${f.matched} matched buildings`,
  `Hotels (${hotel.no} of ${hotel.records})`, `multifamily housing (${mf.no} of ${mf.records})`,
  `${f.final.no} read No, ${f.final.yes} read Yes`, f.sources.inventory.sha256, f.sources.energy.sha256
]) assert.ok(briefing.includes(claim), `Briefing figure missing: ${claim}`);
const tableRows = [...briefingHTML.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)][0][1].match(/<tr>/g).length;
assert.equal(tableRows, f.by_use.length);
const allowedExternal = ['https://target-finder.mcbeps.org/building-inventory', 'https://mcbeps.org/', 'https://data.montgomerycountymd.gov/d/ih88-a6aa', 'https://www2.montgomerycountymd.gov/mcgportalapps/Press_Detail.aspx?Item_ID=46611', 'https://mde.maryland.gov/programs/air/ClimateChange/Clean-Buildings/Pages/BEPS.aspx'];
for (const html of [briefingHTML, await get('/')]) for (const [, href] of html.matchAll(/href="(https?:[^"]+)"/g)) {
  if (href.startsWith('https://mbrace-insight.niceshark22.chatgpt.site')) continue;
  assert.ok(allowedExternal.includes(href), `Unreviewed external link: ${href}`);
}
for (const [, href] of (await get('/')).matchAll(/href="(\/[^"#?]*)/g)) await get(href);

const post = payload => app.fetch(new Request(origin + '/api/capture', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(payload) }), env, {});
let response = await post({ type: 'resource', asset: 'moco-20814-beps-data-sheet', email: 'operator@example.invalid', source: 'test-briefing' });
assert.equal(response.status, 201);
const result = await response.json();
assert.equal(result.newsletter_requested, false); assert.equal(result.email_sent, false);
assert.equal((await app.fetch(new Request(origin + '/download/moco-20814-beps-data-sheet'), env, {})).status, 403);
const sheet = await (await app.fetch(new Request(origin + result.download_url), env, {})).text();
assert.match(sheet, /# The 20814 BEPS Data Sheet/);
const section = (start, end) => sheet.slice(sheet.indexOf(start), sheet.indexOf(end)).split('\n').filter(line => line.startsWith('| ') && !line.startsWith('| ---') && !line.startsWith('| County building ID'));
assert.equal(section('## Building-level records', '## Method').length, f.inventory_in_zip, 'Data sheet should list every 20814 inventory record');
assert.equal(section('## Inventory records with no energy map match', '## Building-level records').length, f.unmatched.length);
assert.equal((await db.prepare("SELECT newsletter_status FROM contacts WHERE email='operator@example.invalid'").first()).newsletter_status, 'not_requested');
const meta = JSON.parse((await get('/')).match(/<script id="resources-metadata" type="application\/json">([\s\S]*?)<\/script>/)[1]);
for (const id of ['moco-20814-beps-data-sheet', 'four-zip-worksheet', 'evidence-worksheet']) assert.ok(meta.some(r => r.id === id), `Homepage dialog metadata missing ${id}`);
console.log(`Briefing checks passed: ${homeClaims.length} homepage figures and the briefing match the county-derived figures, links are reviewed, and the 20814 data sheet unlocks through the consent-separated download flow.`);
