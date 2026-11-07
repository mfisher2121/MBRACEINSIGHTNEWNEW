// Builds the 20814 briefing figures and the protected data sheet from the
// November 7, 2026 county exports in evidence/20814. Every number the edition
// publishes comes from content/briefing-20814.json, and scripts/test-briefing.mjs
// checks the published pages against it.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const evidence = path.join(root, 'evidence/20814');
const read = name => fs.readFile(path.join(evidence, name), 'utf8');

function parseCSV(text) {
  const rows = []; let row = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = ''; rows.push(row); row = [];
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows.filter(r => r.length > 1 || r[0]);
  return body.map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

const sha = async name => createHash('sha256').update(await fs.readFile(path.join(evidence, name))).digest('hex');
const count = (list, key) => list.reduce((acc, item) => ((acc[key(item)] = (acc[key(item)] || 0) + 1), acc), {});

const beps = parseCSV(await read('beps-records-20814.csv'));
const manifest = JSON.parse(await read('beps-manifest.json'));
const permitSummary = JSON.parse(await read('permits-summary.json'));
const permitChecks = JSON.parse(await read('permits-checks.json'));
const permits = parseCSV(await read('permits-records-20814.csv'));

const matched = beps.filter(r => r.energy_postal_code);
const unmatched = beps.filter(r => !r.energy_postal_code);
const interim = count(matched, r => r.source_meeting_interim_standard || 'Blank');
const final = count(matched, r => r.source_meeting_final_standard || 'Blank');
const reportStatus = count(matched, r => r.source_benchmarking_report_status || 'Blank');
const byUse = Object.entries(count(matched, r => r.inventory_use_type)).map(([use, n]) => {
  const rows = matched.filter(r => r.inventory_use_type === use);
  const c = count(rows, r => r.source_meeting_interim_standard || 'Blank');
  return { use, records: n, yes: c.Yes || 0, no: c.No || 0, undisclosed: c.Undisclosed || 0 };
}).sort((a, b) => b.records - a.records || a.use.localeCompare(b.use));

const figures = {
  zip: manifest.pilot_zip,
  retrieved_utc: manifest.checked_at_utc,
  reporting_year_label: manifest.source_reporting_year_label,
  county: { inventory: manifest.county_source_counts.inventory, energy: manifest.county_source_counts.energy },
  inventory_in_zip: manifest.inventory_records_in_zip,
  energy_in_zip: manifest.energy_records_in_zip,
  matched: matched.length,
  unmatched: unmatched.map(r => ({ mbid: r.mbid, name: r.inventory_name || '(no name in inventory)', use: r.inventory_use_type || '(no use type in inventory)' })),
  interim: { yes: interim.Yes || 0, no: interim.No || 0, undisclosed: interim.Undisclosed || 0 },
  final: { yes: final.Yes || 0, no: final.No || 0, undisclosed: final.Undisclosed || 0 },
  report_status: reportStatus,
  interim_no_and_report_in_compliance: matched.filter(r => r.source_meeting_interim_standard === 'No' && r.source_benchmarking_report_status === 'in compliance').length,
  eui_blank: matched.filter(r => r.source_normalized_net_site_eui === '').length,
  eui_undisclosed: matched.filter(r => r.source_normalized_net_site_eui === 'Undisclosed').length,
  by_use: byUse,
  review_queue_items: manifest.new_review_item_count,
  sources: {
    inventory: { url: manifest.sources.inventory.url, sha256: manifest.sources.inventory.sha256, file_time_utc: manifest.sources.inventory.download_file_mtime_utc },
    energy: { url: manifest.sources.energy.url, sha256: manifest.sources.energy.sha256, file_time_utc: manifest.sources.energy.download_file_mtime_utc },
    permits: { url: `https://data.montgomerycountymd.gov/d/${permitSummary.dataset_id}`, retrieved_utc: permitSummary.retrieved_at_utc, rows_updated_utc: permitSummary.source_rows_updated_at_utc }
  },
  permits: {
    period_start: permitSummary.period_start.slice(0, 10),
    period_end_exclusive: permitSummary.period_end_exclusive.slice(0, 10),
    county: permitSummary.record_count,
    zip: permits.length,
    worktype: count(permits, r => r.worktype),
    usecode: count(permits, r => r.usecode),
    last_issue_date: permitSummary.last_issue_date.slice(0, 10),
    source_count_matches_download: permitChecks.source_count_matches_download,
    municipal_datasets_included: permitChecks.municipal_datasets_included
  },
  evidence_sha256: {
    'beps-records-20814.csv': await sha('beps-records-20814.csv'),
    'beps-manifest.json': await sha('beps-manifest.json'),
    'permits-summary.json': await sha('permits-summary.json'),
    'permits-records-20814.csv': await sha('permits-records-20814.csv')
  }
};

if (figures.matched !== figures.energy_in_zip) throw new Error('Matched count no longer equals energy records in ZIP; review the join before publishing.');
if (figures.matched + unmatched.length !== figures.inventory_in_zip) throw new Error('Inventory count does not reconcile.');
if (!figures.permits.source_count_matches_download) throw new Error('Permit download did not match the source count.');

await fs.writeFile(path.join(root, 'content/briefing-20814.json'), JSON.stringify(figures, null, 2) + '\n');

const cell = value => String(value ?? '').replaceAll('|', '\\|') || '—';
const title = s => s.replace(/(^|[\s\/(])([a-z])/g, (_, p, c) => p + c.toUpperCase()).replace(/ (And|Or|Of) /g, w => w.toLowerCase());
const sheet = `# The 20814 BEPS Data Sheet

MBRACE INSIGHT · Montgomery County edition · Draft for review

County exports retrieved November 7, 2026. Energy map reporting-year label as published: **${figures.reporting_year_label}**.

## What this is

A building-level table of what Montgomery County publishes for ZIP ${figures.zip}: the county BEPS building inventory joined to the county energy performance map by exact county building ID. Field values are copied as published. MBRACE INSIGHT has not changed, estimated, or filled in any value.

## What this is not

- Not a compliance determination. The “Meeting Interim Standard” and “Meeting Final Standard” columns are the county's projections, as published.
- Not a lead list. A “No” does not show equipment age or condition, an owner's plans, a budget, or a project.
- Not complete coverage. Buildings outside the county BEPS inventory, and ZIP assignments the county did not publish as ${figures.zip}, are outside this table.

## Summary

| Measure | Count |
| --- | --- |
| Inventory records with postal code ${figures.zip} | ${figures.inventory_in_zip} |
| Energy map records with postal code ${figures.zip} | ${figures.energy_in_zip} |
| Matched by county building ID | ${figures.matched} |
| Inventory records with no energy map match | ${figures.unmatched.length} |
| Matched: meeting projected interim standard = Yes | ${figures.interim.yes} |
| Matched: meeting projected interim standard = No | ${figures.interim.no} |
| Matched: meeting projected interim standard = Undisclosed | ${figures.interim.undisclosed} |
| Matched: normalized net site EUI blank | ${figures.eui_blank} |
| Matched: normalized net site EUI “Undisclosed” | ${figures.eui_undisclosed} |

## Projected interim standard by building use type (matched records)

| Use type (inventory) | Records | Yes | No | Undisclosed |
| --- | --- | --- | --- | --- |
${figures.by_use.map(u => `| ${title(u.use)} | ${u.records} | ${u.yes} | ${u.no} | ${u.undisclosed} |`).join('\n')}
| **Total** | **${figures.matched}** | **${figures.interim.yes}** | **${figures.interim.no}** | **${figures.interim.undisclosed}** |

## Inventory records with no energy map match

| County building ID | Inventory name | Use type |
| --- | --- | --- |
${figures.unmatched.map(u => `| ${cell(u.mbid)} | ${cell(u.name)} | ${cell(u.use)} |`).join('\n')}

## Building-level records

Names and use types come from the county inventory. Status, EUI, and standards come from the county energy map. EUI and standards are in kBtu/ft².

| County building ID | Inventory name | Use type | Benchmarking report status | Normalized net site EUI | Projected interim standard | Meeting interim | Projected final standard | Meeting final |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
${beps.map(r => `| ${cell(r.mbid)} | ${cell(r.inventory_name)} | ${cell(r.inventory_use_type)} | ${cell(r.source_benchmarking_report_status)} | ${cell(r.source_normalized_net_site_eui)} | ${cell(r.source_projected_interim_standard)} | ${cell(r.source_meeting_interim_standard)} | ${cell(r.source_projected_final_standard)} | ${cell(r.source_meeting_final_standard)} |`).join('\n')}

## Method

1. Downloaded the county building inventory and energy map exports with their official export controls on November 7, 2026.
2. Kept records whose published postal code is ${figures.zip}. Postal codes were not inferred from addresses.
3. Joined the two exports on exact county building ID. No fuzzy or name-based matching.
4. Kept every published value as text, including blanks and “Undisclosed.” Flagged ${figures.review_queue_items} review items in the collector's queue (invalid postal codes outside this scope, missing matches, and missing or undisclosed measurements).

## Sources

- County BEPS building inventory: ${figures.sources.inventory.url} — export file time ${figures.sources.inventory.file_time_utc}, SHA-256 \`${figures.sources.inventory.sha256}\`
- County energy performance map: ${figures.sources.energy.url} — export file time ${figures.sources.energy.file_time_utc}, SHA-256 \`${figures.sources.energy.sha256}\`
- Montgomery County Mechanical Permits (comparison only): ${figures.sources.permits.url} — retrieved ${figures.sources.permits.retrieved_utc}, source rows last updated ${figures.sources.permits.rows_updated_utc}

Recheck the county's current records before relying on any value for a business, compliance, or purchasing decision. Corrections: mfisher@mbraceinsight.com.
`;
await fs.writeFile(path.join(root, 'assets-downloads/moco-20814-beps-data-sheet.md'), sheet);
console.log(`Prepared 20814 briefing figures: ${figures.matched} matched, ${figures.interim.no} interim No, ${figures.unmatched.length} unmatched, ${figures.permits.zip} permits.`);
