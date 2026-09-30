// Stage 1 of the pipeline: RETRIEVAL ONLY.
//
//   node scripts/harvest.mjs   ->  data/records.json
//
// Queries arXiv and OpenAlex with the block strings from the review protocol and
// writes every record it finds, with the full abstract and DOI retained. No
// eligibility judgement is made here — screening is scripts/screen.mjs. Keeping
// retrieval and screening apart is what lets the PRISMA-ScR flow diagram report
// records identified, duplicates removed, and records screened as distinct
// numbers instead of one conflated total.

import { writeFileSync, readFileSync, existsSync, unlinkSync } from "node:fs";
import { createHash } from "node:crypto";

const UA = "aixbio-scoping-review/0.2 (academic scoping review harvester)";
const PER_QUERY = 40;

/** Decode the handful of XML/HTML entities that appear in feed titles. */
const decode = (s) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");

/** Search strings, mirroring the three-block pattern in search-strategy.md. */
export const QUERIES = [
  { id: "Q1", label: "LLM × biosecurity × misuse", arxiv: 'all:"large language model" AND all:"biosecurity"', openalex: "large language model biosecurity misuse" },
  { id: "Q2", label: "AI × biological weapons", arxiv: 'all:"artificial intelligence" AND all:"biological weapons"', openalex: "artificial intelligence biological weapons" },
  { id: "Q3", label: "biological design tools × misuse", arxiv: 'all:"biological design tool" OR all:"protein design" AND all:"biosecurity"', openalex: "biological design tools biosecurity misuse" },
  { id: "Q4", label: "AI × dual-use biology", arxiv: 'all:"dual-use" AND all:"artificial intelligence" AND all:"biology"', openalex: "dual-use artificial intelligence biology risk" },
  { id: "Q5", label: "LLM × bioweapon uplift", arxiv: 'all:"language model" AND all:"bioweapon"', openalex: "language model bioweapon uplift threat actor" },
  { id: "Q6", label: "AI × pandemic pathogen risk", arxiv: 'all:"artificial intelligence" AND all:"pandemic pathogen"', openalex: "artificial intelligence pandemic pathogen risk" },
  { id: "Q7", label: "frontier model CBRN evaluation", arxiv: 'all:"frontier model" AND all:"CBRN"', openalex: "frontier model CBRN capability evaluation biological" },
  { id: "Q8", label: "nucleic acid synthesis screening × AI", arxiv: 'all:"nucleic acid synthesis" AND all:"screening"', openalex: "nucleic acid synthesis screening biosecurity artificial intelligence" },
  { id: "Q9", label: "AI biosafety governance", arxiv: 'all:"AI" AND all:"biosafety" AND all:"governance"', openalex: "artificial intelligence biosafety governance dual use research" },
  { id: "Q10", label: "autonomous lab agents × risk", arxiv: 'all:"autonomous" AND all:"laboratory" AND all:"chemical safety"', openalex: "autonomous laboratory agents chemical biological safety risk" },
  { id: "Q11", label: "AI × bioterrorism", arxiv: 'all:"artificial intelligence" AND all:"bioterrorism"', openalex: "artificial intelligence bioterrorism" },
  { id: "Q12", label: "LLM × gain-of-function", arxiv: 'all:"language model" AND all:"gain-of-function"', openalex: "language model gain of function pathogen" },
  { id: "Q13", label: "AI × synthetic biology dual-use", arxiv: 'all:"synthetic biology" AND all:"artificial intelligence"', openalex: "synthetic biology artificial intelligence dual-use" },
  { id: "Q14", label: "DNA synthesis × biosecurity", arxiv: 'all:"DNA synthesis" AND all:"biosecurity"', openalex: "DNA synthesis biosecurity artificial intelligence" },
  { id: "Q15", label: "red team × biosecurity", arxiv: 'all:"red team" AND all:"biosecurity"', openalex: "red team jailbreak biosecurity language model" },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchOk(url, { retries = 6 } = {}) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.ok) return res;
    lastErr = new Error(`${res.status}`);
    if (res.status !== 429 && res.status < 500) throw lastErr;
    const wait = Math.min(8000 * 2 ** i, 60000);
    console.log(`  retry ${i + 1}/${retries} after ${res.status}, waiting ${wait}ms`);
    await sleep(wait);
  }
  throw lastErr;
}

export const normaliseTitle = (t) =>
  t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function classifySourceType(venue, isPreprint) {
  if (isPreprint) return "Preprint";
  const v = (venue || "").toLowerCase();
  if (!v) return "Preprint";
  if (/(rand|cset|resilience|nti|academies|nasem|institute|centre|center|council|foundation)/.test(v))
    return "Institutional";
  if (/(government|congress|homeland|department|agency|commission)/.test(v)) return "Government";
  return "Peer-reviewed";
}

// --------------------------------------------------------------------- fetchers

async function fetchArxiv(query) {
  const url =
    "http://export.arxiv.org/api/query?search_query=" +
    encodeURIComponent(query.arxiv) +
    `&start=0&max_results=${PER_QUERY}&sortBy=relevance`;
  const res = await fetchOk(url);
  if (!res.ok) throw new Error(`arXiv ${res.status}`);
  const xml = await res.text();
  return xml
    .split("<entry>")
    .slice(1)
    .map((e) => {
      const pick = (tag) => {
        const m = e.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
        return m ? m[1].replace(/\s+/g, " ").trim() : "";
      };
      const published = pick("published");
      const doiMatch = e.match(/<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/);
      return {
        title: decode(pick("title")),
        abstract: decode(pick("summary")),
        authors: [...e.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((m) => m[1].trim()),
        year: published ? Number(published.slice(0, 4)) : 0,
        venue: "arXiv",
        url: pick("id"),
        doi: doiMatch ? doiMatch[1].trim().toLowerCase() : "",
        isPreprint: true,
        database: "arXiv",
        query: query.id,
        queryLabel: query.label,
      };
    })
    .filter((r) => r.title && r.abstract);
}

async function fetchOpenAlex(query) {
  const url =
    "https://api.openalex.org/works?search=" +
    encodeURIComponent(query.openalex) +
    `&per_page=${PER_QUERY}&filter=from_publication_date:2017-01-01,has_abstract:true` +
    "&mailto=scoping-review@example.org";
  const res = await fetchOk(url);
  if (!res.ok) throw new Error(`OpenAlex ${res.status}`);
  const json = await res.json();
  return (json.results || [])
    .map((w) => {
      const inv = w.abstract_inverted_index;
      let abstract = "";
      if (inv) {
        const words = [];
        for (const [word, positions] of Object.entries(inv))
          for (const p of positions) words[p] = word;
        abstract = words.filter(Boolean).join(" ");
      }
      const venue =
        w.primary_location?.source?.display_name || w.host_venue?.display_name || "";
      const doi = (w.doi || "").replace(/^https?:\/\/doi\.org\//, "").toLowerCase();
      return {
        title: decode(w.display_name || ""),
        abstract: decode(abstract),
        authors: (w.authorships || []).slice(0, 6).map((a) => a.author?.display_name).filter(Boolean),
        year: w.publication_year || 0,
        venue: venue || "unlisted venue",
        url: doi ? `https://doi.org/${doi}` : w.id,
        doi,
        isPreprint: w.type === "preprint" || /arxiv|biorxiv|medrxiv|ssrn/i.test(venue),
        database: "OpenAlex",
        query: query.id,
        queryLabel: query.label,
      };
    })
    .filter((r) => r.title && r.abstract && r.abstract.length > 120);
}

// ------------------------------------------------------------------------ main

const checkpointUrl = new URL("../data/harvest-checkpoint.json", import.meta.url);
const done = new Set();
let identified = [];
let perDatabase = {};
let perQuery = {};
const failures = [];

if (existsSync(checkpointUrl)) {
  const ck = JSON.parse(readFileSync(checkpointUrl, "utf8"));
  identified = ck.identified ?? [];
  perDatabase = ck.perDatabase ?? {};
  perQuery = ck.perQuery ?? {};
  for (const k of ck.done ?? []) done.add(k);
  console.log(`resuming harvest: ${done.size} calls already done, ${identified.length} identified`);
}

for (const q of QUERIES) {
  for (const [name, fn] of [["arXiv", fetchArxiv], ["OpenAlex", fetchOpenAlex]]) {
    const key = `${q.id} ${name}`;
    if (done.has(key)) {
      console.log(`${key}: cached`);
      continue;
    }
    try {
      const recs = (await fn(q)).filter((r) => r.year >= 2017);
      identified.push(...recs);
      perDatabase[name] = (perDatabase[name] ?? 0) + recs.length;
      perQuery[q.id] = (perQuery[q.id] ?? 0) + recs.length;
      done.add(key);
      writeFileSync(
        checkpointUrl,
        JSON.stringify({ done: [...done], identified, perDatabase, perQuery })
      );
      console.log(`${key}: ${recs.length}`);
    } catch (err) {
      failures.push(`${key}: ${err.message}`);
      console.log(`${key}: FAILED ${err.message}`);
    }
    await sleep(name === "OpenAlex" ? 8000 : 1500);
  }
}

// Deduplicate on DOI first, then on normalised title. DOI matching is what
// catches a preprint and its published version, which title matching alone
// misses when the title was reworded for the journal.
const byKey = new Map();
let dupDoi = 0;
let dupTitle = 0;

for (const r of identified) {
  const doiKey = r.doi ? `doi:${r.doi}` : null;
  const titleKey = `ti:${normaliseTitle(r.title)}`;
  if (doiKey && byKey.has(doiKey)) {
    dupDoi++;
    continue;
  }
  if (byKey.has(titleKey)) {
    dupTitle++;
    continue;
  }
  // A slug from the first words of the title is readable but not unique — two
  // distinct papers can open with the same five words, and when they do their
  // scenario IDs collide and passage verification checks against the wrong
  // abstract. The DOI/URL digest makes the id unique while keeping it legible.
  const slug = normaliseTitle(r.title).split(" ").slice(0, 5).join("-").slice(0, 40);
  const digest = createHash("sha1").update(r.doi || r.url || r.title).digest("hex").slice(0, 6);
  const rec = {
    id: `${slug}-${digest}`,
    ...r,
    abstract: r.abstract.replace(/\s+/g, " ").trim(),
    authors: r.authors.length
      ? r.authors.slice(0, 5).join(", ") + (r.authors.length > 5 ? ", et al." : "")
      : "Unattributed",
    sourceType: classifySourceType(r.venue, r.isPreprint),
  };
  if (doiKey) byKey.set(doiKey, rec);
  byKey.set(titleKey, rec);
}

const records = [...new Set(byKey.values())];

const ids = new Set(records.map((r) => r.id));
if (ids.size !== records.length)
  throw new Error(
    `record ids are not unique (${records.length} records, ${ids.size} ids) — downstream passage verification would compare against the wrong source`
  );

if (failures.length) {
  console.log("failures:", failures);
  throw new Error(
    `harvest incomplete (${failures.length} failed calls); records.json was not written`
  );
}

writeFileSync(
  new URL("../data/records.json", import.meta.url),
  JSON.stringify(
    {
      generated: new Date().toISOString(),
      identified: identified.length,
      perDatabase,
      perQuery,
      duplicatesByDoi: dupDoi,
      duplicatesByTitle: dupTitle,
      failures,
      records,
    },
    null,
    2
  )
);
if (existsSync(checkpointUrl)) unlinkSync(checkpointUrl);

console.log(
  `\nidentified ${identified.length}; removed ${dupDoi} DOI duplicates and ${dupTitle} title duplicates; ${records.length} unique records retained`
);
if (failures.length) console.log("failures:", failures);
