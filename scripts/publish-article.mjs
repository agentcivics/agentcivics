#!/usr/bin/env node
/**
 * publish-article — turn a draft markdown into a publish-ready article.
 *
 * Workflow:
 *   1. Read draft markdown with YAML front matter and inline asset blocks.
 *   2. For each ```image fenced block: call fal.ai (Flux), save PNG to
 *      docs/public/articles/<slug>/<slot>.png, replace the block with
 *      a Markdown image reference.
 *   3. For each ```svg fenced block: render via @resvg/resvg-js, save PNG
 *      to the same directory, replace with a Markdown image reference.
 *   4. Write the rewritten markdown to docs/articles/<slug>.md (next to
 *      existing articles in the VitePress tree).
 *
 * Usage:
 *   node --env-file=.env scripts/publish-article.mjs <draft.md>
 *   node --env-file=.env scripts/publish-article.mjs --force <draft.md>
 *   node --env-file=.env scripts/publish-article.mjs --dry-run <draft.md>
 *
 * Draft front matter (YAML):
 *   ---
 *   title: "Article title"
 *   slug: my-article-slug
 *   date: 2026-05-12
 *   description: "One-sentence summary"
 *   defaultModel: dev       # schnell | dev | pro — for ```image blocks
 *   defaultSeed: 42         # for stylistic consistency across an article
 *   defaultStylePrefix: ""  # prepended to every prompt
 *   ---
 *
 * Inline image block (Flux generation):
 *   ```image slot=header size=landscape_16_9 alt="A cathedral repurposed as a registry"
 *   A cathedral interior repurposed as a civil registry, isometric
 *   perspective, editorial illustration style, soft cyan and warm gold
 *   lighting, no text.
 *   ```
 *
 * Inline svg block (vector → PNG conversion):
 *   ```svg slot=architecture alt="Architecture diagram"
 *   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400">...</svg>
 *   ```
 */

import { readFile, writeFile, mkdir, access, readdir } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── arg parsing ──────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flags = new Set(args.filter(a => a.startsWith('--')));
const positional = args.filter(a => !a.startsWith('--'));
const draftPath = positional[0];
const FORCE = flags.has('--force');
const DRY_RUN = flags.has('--dry-run');

if (!draftPath) {
  console.error('Usage: node --env-file=.env scripts/publish-article.mjs [--force] [--dry-run] <draft.md>');
  process.exit(1);
}
if (!process.env.FAL_KEY) {
  console.error('FAL_KEY is not set. Run with: node --env-file=.env scripts/publish-article.mjs <draft.md>');
  process.exit(1);
}

const FAL_KEY = process.env.FAL_KEY;

// ── front matter parser (tiny, YAML subset) ──────────────────────────
function parseFrontMatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { fm: {}, body: md };
  const fm = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    let value = kv[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    fm[kv[1]] = value;
  }
  return { fm, body: m[2] };
}

// ── fenced-block parser ──────────────────────────────────────────────
// matches: ```<lang> key=value key2="value 2"\n<body>\n```
function parseFencedBlocks(body) {
  const blocks = [];
  const re = /```(image|svg)([^\n]*)\n([\s\S]*?)\n```/g;
  let match;
  while ((match = re.exec(body)) !== null) {
    blocks.push({
      lang: match[1],
      attrs: parseAttrs(match[2]),
      content: match[3],
      raw: match[0],
      index: match.index,
    });
  }
  return blocks;
}

function parseAttrs(attrStr) {
  const attrs = {};
  const re = /([A-Za-z_][A-Za-z0-9_]*)=(?:"([^"]*)"|([^\s]+))/g;
  let m;
  while ((m = re.exec(attrStr)) !== null) attrs[m[1]] = m[2] ?? m[3];
  return attrs;
}

// ── fal.ai client ────────────────────────────────────────────────────
const FAL_MODELS = {
  schnell: 'fal-ai/flux/schnell',
  dev: 'fal-ai/flux/dev',
  pro: 'fal-ai/flux-pro/v1.1',
};

async function generateImage({ prompt, model = 'dev', size = 'landscape_16_9', seed }) {
  const endpoint = FAL_MODELS[model];
  if (!endpoint) throw new Error(`Unknown model "${model}". Use one of: ${Object.keys(FAL_MODELS).join(', ')}`);

  const body = {
    prompt,
    image_size: size,
    num_inference_steps: model === 'schnell' ? 4 : 28,
  };
  if (seed != null) body.seed = Number(seed);

  const res = await fetch(`https://fal.run/${endpoint}`, {
    method: 'POST',
    headers: { 'Authorization': `Key ${FAL_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`fal.ai ${endpoint} returned ${res.status}: ${errText}`);
  }
  const data = await res.json();
  const url = data.images?.[0]?.url;
  if (!url) throw new Error(`No image URL in fal.ai response: ${JSON.stringify(data)}`);
  return { url, seed: data.seed };
}

async function downloadToFile(url, outPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${url} failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(outPath, buf);
  return buf.length;
}

// ── svg renderer ─────────────────────────────────────────────────────
async function renderSvg(svgString, outPath, { width = 1600 } = {}) {
  const { Resvg } = await import('@resvg/resvg-js');
  const resvg = new Resvg(svgString, { fitTo: { mode: 'width', value: width } });
  const png = resvg.render().asPng();
  await writeFile(outPath, png);
  return png.length;
}

// ── path helpers ─────────────────────────────────────────────────────
async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

// ── main ─────────────────────────────────────────────────────────────
const draftAbs = resolve(process.cwd(), draftPath);
const draftSrc = await readFile(draftAbs, 'utf-8');
const { fm, body } = parseFrontMatter(draftSrc);

if (!fm.slug) {
  console.error('Missing required front matter: slug');
  process.exit(1);
}

const slug = fm.slug;
const defaultModel = fm.defaultModel || 'dev';
const defaultSeed = fm.defaultSeed ? Number(fm.defaultSeed) : undefined;
const defaultStylePrefix = fm.defaultStylePrefix || '';

const assetsDir = resolve(ROOT, 'docs/public/articles', slug);
const articlePath = resolve(ROOT, 'docs/articles', `${slug}.md`);
const publicUrlBase = `/articles/${slug}`;

console.log(`Draft:    ${draftAbs}`);
console.log(`Slug:     ${slug}`);
console.log(`Assets:   ${assetsDir.replace(ROOT + '/', '')}`);
console.log(`Article:  ${articlePath.replace(ROOT + '/', '')}`);
console.log(`Mode:     ${DRY_RUN ? 'dry-run' : 'live'}${FORCE ? ' (force regen)' : ''}`);

if (!DRY_RUN) await mkdir(assetsDir, { recursive: true });

const blocks = parseFencedBlocks(body);
console.log(`Blocks:   ${blocks.length} (${blocks.filter(b=>b.lang==='image').length} image, ${blocks.filter(b=>b.lang==='svg').length} svg)`);

// Process each block in sequence. Build a replacement map for later rewrite.
const replacements = [];
for (const block of blocks) {
  const slot = block.attrs.slot;
  if (!slot) {
    console.error(`Block missing required slot= attribute:\n${block.raw.slice(0, 200)}`);
    process.exit(1);
  }
  const alt = block.attrs.alt || slot;
  const outFile = `${assetsDir}/${slot}.png`;
  const outRel = `${publicUrlBase}/${slot}.png`;

  if (!FORCE && await exists(outFile)) {
    console.log(`  [skip] ${slot} → ${outFile.replace(ROOT + '/', '')} (already exists)`);
    replacements.push({ raw: block.raw, md: `![${alt}](${outRel})` });
    continue;
  }

  if (block.lang === 'image') {
    const model = block.attrs.model || defaultModel;
    const size = block.attrs.size || 'landscape_16_9';
    const seed = block.attrs.seed != null ? Number(block.attrs.seed) : defaultSeed;
    const prompt = (defaultStylePrefix ? defaultStylePrefix + ' ' : '') + block.content.trim();
    console.log(`  [gen ] ${slot} (${model}, seed=${seed ?? '∅'})`);
    if (DRY_RUN) {
      console.log(`         prompt: ${prompt.slice(0, 120)}${prompt.length > 120 ? '…' : ''}`);
      replacements.push({ raw: block.raw, md: `![${alt}](${outRel})` });
      continue;
    }
    const { url, seed: actualSeed } = await generateImage({ prompt, model, size, seed });
    const bytes = await downloadToFile(url, outFile);
    console.log(`         saved ${bytes} bytes, seed=${actualSeed}`);
  } else if (block.lang === 'svg') {
    const widthAttr = block.attrs.width ? Number(block.attrs.width) : 1600;
    console.log(`  [svg ] ${slot} (width=${widthAttr})`);
    if (DRY_RUN) {
      replacements.push({ raw: block.raw, md: `![${alt}](${outRel})` });
      continue;
    }
    const bytes = await renderSvg(block.content, outFile, { width: widthAttr });
    console.log(`         saved ${bytes} bytes`);
  }
  replacements.push({ raw: block.raw, md: `![${alt}](${outRel})` });
}

// Rewrite body: replace each raw block with its markdown reference.
let rewritten = body;
for (const r of replacements) rewritten = rewritten.replace(r.raw, r.md);

// Strip front-matter fields the script consumes but the article doesn't need.
const articleFm = { ...fm };
delete articleFm.defaultModel;
delete articleFm.defaultSeed;
delete articleFm.defaultStylePrefix;

const fmLines = Object.entries(articleFm).map(([k, v]) => `${k}: ${typeof v === 'string' && v.includes(':') ? `"${v}"` : v}`).join('\n');
const finalMd = `---\n${fmLines}\n---\n${rewritten}`;

if (DRY_RUN) {
  console.log('\n--- dry run: not writing files ---');
  console.log(`Would write: ${articlePath.replace(ROOT + '/', '')} (${finalMd.length} chars)`);
} else {
  await mkdir(dirname(articlePath), { recursive: true });
  await writeFile(articlePath, finalMd);
  console.log(`\nArticle written: ${articlePath.replace(ROOT + '/', '')}`);
  console.log(`Assets:          ${assetsDir.replace(ROOT + '/', '')}`);

  await updateArticlesIndex();

  console.log('\nNext:');
  console.log(`  - Review the rendered article at agentcivics.org/docs/articles/${slug}/ after the next pages deploy`);
  console.log(`  - Cross-post to Medium following docs/articles/MEDIUM_CROSSPOST.md`);
}

async function updateArticlesIndex() {
  const indexPath = resolve(ROOT, 'docs/articles/index.md');
  if (!(await exists(indexPath))) return;

  const articleDir = resolve(ROOT, 'docs/articles');
  const entries = (await readdir(articleDir, { withFileTypes: true }))
    .filter(e => e.isFile() && e.name.endsWith('.md') && e.name !== 'index.md' && !e.name.startsWith('_'));

  const articles = [];
  for (const e of entries) {
    const md = await readFile(resolve(articleDir, e.name), 'utf-8');
    const { fm } = parseFrontMatter(md);
    if (!fm.title || !fm.slug) continue;
    articles.push({
      title: fm.title,
      slug: fm.slug,
      date: fm.date || '',
      description: fm.description || '',
    });
  }
  articles.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const listing = articles.map(a =>
    `### [${a.title}](./${a.slug})\n\n${a.date ? `*${a.date}* — ` : ''}${a.description}`
  ).join('\n\n---\n\n');

  const indexMd = await readFile(indexPath, 'utf-8');
  const re = /(<!-- ARTICLES_INDEX_START[^>]*-->)([\s\S]*?)(<!-- ARTICLES_INDEX_END[^>]*-->)/;
  if (!re.test(indexMd)) {
    console.log('  (no INDEX markers in articles/index.md — skipping listing update)');
    return;
  }
  const updated = indexMd.replace(re, `$1\n\n${listing}\n\n$3`);
  await writeFile(indexPath, updated);
  console.log(`  Updated index listing: ${articles.length} article(s)`);
}
