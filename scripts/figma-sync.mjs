/**
 * Figma drift report for SHINIGAMAE.DEV.
 *
 *   npm run figma:check    # report drift, exit 1 if any
 *   npm run figma:sync     # accept current Figma as the baseline
 *
 * It answers three questions and never edits your CSS:
 *
 *   1. Has the Figma file moved since we last looked?   (version / lastModified)
 *   2. Did the design system change?                    (Figma now vs design/figma.sync.json)
 *   3. Does the code still match the design?            (Figma now vs src/styles/tokens.css)
 *
 * Exit codes: 0 in sync - 1 drift found - 2 error.
 *
 * Why a script rather than reading Figma variables: the file carries raw hex
 * on every node, with no published paint or text styles, so tokens have to be
 * parsed out of the Foundations frame. If styles get published in Figma,
 * replace extractFoundations() with a read of the file's `styles` map.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import {
  FILE_KEY,
  FOUNDATIONS_NODE,
  COMPONENT_NODES,
  readToken,
  figmaGet,
  firstSolid,
  walk,
  specOf,
} from './figma-lib.mjs';

const STAMP_PATH = 'design/figma.sync.json';
const TOKENS_PATH = 'src/styles/tokens.css';

/** Figma swatch label -> the CSS custom property it drives. */
const COLOUR_MAP = {
  GRAPHITE: '--color-canvas',
  PANEL: '--color-panel',
  BORDER: '--color-line',
  TEXT: '--color-ink',
  MUTED: '--color-muted',
  'SIGNAL CYAN': '--color-signal',
};

/** Colour, unless output is piped or NO_COLOR is set. */
const useColour = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
const paint = (code) => (s) =>
  useColour ? `\u001b[${code}m${s}\u001b[0m` : String(s);

const c = {
  dim: paint(2),
  bold: paint(1),
  red: paint(31),
  green: paint(32),
  yellow: paint(33),
  cyan: paint(36),
};

/* ---------------------------------------------------------------- extract */

/**
 * Pull colour tokens, the type scale and the layout rules out of the
 * Foundations frame. Each swatch is a rectangle with its hex repeated in the
 * label beneath it, so we read both and flag any disagreement.
 */
function extractFoundations(root) {
  const texts = [];
  const rects = [];
  for (const node of walk(root)) {
    const box = node.absoluteBoundingBox;
    if (!box) continue;
    if (node.type === 'TEXT') {
      texts.push({ x: box.x, y: box.y, chars: node.characters ?? '' });
    }
    if (node.type === 'RECTANGLE') {
      rects.push({ x: box.x, y: box.y, fill: firstSolid(node.fills) });
    }
  }

  const colors = {};
  const swatchMismatches = [];
  for (const t of texts) {
    const m = t.chars.match(/^(.+?)\s{2,}(#[0-9A-Fa-f]{6})\s*$/);
    if (!m) continue;
    const name = m[1].trim().toUpperCase();
    const hex = m[2].toUpperCase();
    colors[name] = hex;

    // The swatch sits directly above its label, sharing an x position.
    const swatch = rects.find(
      (r) => Math.abs(r.x - t.x) < 4 && r.y < t.y && t.y - r.y < 200,
    );
    if (swatch && swatch.fill && swatch.fill !== hex) {
      swatchMismatches.push({ name, label: hex, swatch: swatch.fill });
    }
  }

  // Layout rules: a mono key on the left, its value to the right, same row.
  const layoutRules = {};
  for (const key of ['GRID', 'SPACING', 'RADIUS', 'MOTION']) {
    const keyNode = texts.find((t) => t.chars.trim() === key);
    if (!keyNode) continue;
    const value = texts
      .filter((t) => t !== keyNode && Math.abs(t.y - keyNode.y) < 16 && t.x > keyNode.x)
      .sort((a, b) => a.x - b.x)[0];
    if (value) layoutRules[key] = value.chars.trim();
  }

  // Type scale: "34 / 40 / MEDIUM" style labels, plus the family lines.
  const typography = {};
  for (const t of texts) {
    const m = t.chars.match(/^(\d+)\s*\/\s*(\d+)\s*\/\s*([A-Z]+)\s*$/);
    if (m) typography[m[3].toLowerCase()] = `${m[1]}/${m[2]}`;
  }
  const families = texts
    .map((t) => t.chars.trim())
    .filter((s) => /^(Space Grotesk|IBM Plex Mono)\s*\//.test(s));
  if (families.length) typography.families = families;

  return { colors, layoutRules, typography, swatchMismatches };
}

/** Parse `--color-*: #hex;` out of tokens.css. */
function extractCssTokens() {
  if (!existsSync(TOKENS_PATH)) return null;
  const css = readFileSync(TOKENS_PATH, 'utf8');
  const out = {};
  const pattern = /(--color-[a-z-]+)\s*:\s*(#[0-9A-Fa-f]{3,8})\s*;/g;
  for (const m of css.matchAll(pattern)) out[m[1]] = m[2].toUpperCase();
  return out;
}

/* ------------------------------------------------------------------- diff */

/** Deep-compare two plain values, collecting `path: before -> after` records. */
function diff(before, after, path = '', out = []) {
  if (before === after) return out;

  const bothObjects =
    before && after && typeof before === 'object' && typeof after === 'object';

  if (!bothObjects) {
    out.push({ path, before, after });
    return out;
  }

  if (Array.isArray(before) || Array.isArray(after)) {
    const a = Array.isArray(before) ? before : [];
    const b = Array.isArray(after) ? after : [];
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
      diff(a[i], b[i], `${path}[${i}]`, out);
    }
    return out;
  }

  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    diff(before[key], after[key], path ? `${path}.${key}` : key, out);
  }
  return out;
}

/** Copy and layer-name changes are not design decisions - rank them lower. */
function isCopy(path) {
  return /(^|\.)copy$/.test(path) || /(^|\.)name$/.test(path);
}

/** Map a diff path back to the component that owns it. */
function ownerOf(path) {
  const match = Object.entries(COMPONENT_NODES).find(([id]) => path.includes(id));
  return match ? match[1] : null;
}

/* ------------------------------------------------------------------- main */

async function main() {
  const update = process.argv.includes('--update');
  const token = readToken();

  process.stdout.write(c.dim('Fetching Figma...\n'));

  const meta = await figmaGet(`files/${FILE_KEY}?depth=1`, token);
  const ids = [FOUNDATIONS_NODE, ...Object.keys(COMPONENT_NODES)].join(',');
  const nodes = await figmaGet(`files/${FILE_KEY}/nodes?ids=${ids}`, token);

  const foundationsNode = nodes.nodes[FOUNDATIONS_NODE]
    ? nodes.nodes[FOUNDATIONS_NODE].document
    : null;
  if (!foundationsNode) {
    throw new Error(
      `Foundations node ${FOUNDATIONS_NODE} is gone from the file. ` +
        'Update FOUNDATIONS_NODE in scripts/figma-lib.mjs.',
    );
  }

  const extracted = extractFoundations(foundationsNode);
  const swatchMismatches = extracted.swatchMismatches;
  const foundations = {
    colors: extracted.colors,
    layoutRules: extracted.layoutRules,
    typography: extracted.typography,
  };

  const components = {};
  const missing = [];
  for (const [id, info] of Object.entries(COMPONENT_NODES)) {
    const node = nodes.nodes[id] ? nodes.nodes[id].document : null;
    if (!node) {
      missing.push({ id, name: info.name, source: info.source });
      continue;
    }
    components[id] = specOf(node);
  }

  const live = {
    fileKey: FILE_KEY,
    version: meta.version,
    lastModified: meta.lastModified,
    foundations,
    components,
  };

  const stamp = existsSync(STAMP_PATH)
    ? JSON.parse(readFileSync(STAMP_PATH, 'utf8'))
    : null;

  if (update) {
    const record = { ...live, syncedAt: new Date().toISOString().slice(0, 10) };
    writeFileSync(STAMP_PATH, `${JSON.stringify(record, null, 2)}\n`);
    console.log(c.green(`\nBaseline updated -> ${STAMP_PATH}`));
    console.log(c.dim(`  version ${live.version} - modified ${live.lastModified}`));
    console.log(c.dim('  Review the diff in git before committing.\n'));
    return 0;
  }

  let drift = false;
  console.log(
    `\n${c.bold('FIGMA / SHINIGAMAE.DEV')}  ` +
      c.dim(`v${live.version} - modified ${live.lastModified}`),
  );

  /* 1 - has the file moved? */
  if (!stamp) {
    console.log(c.yellow(`\nNo baseline at ${STAMP_PATH}. Run npm run figma:sync to record one.`));
    drift = true;
  } else if (stamp.version !== live.version) {
    console.log(
      `\n${c.yellow('FILE CHANGED')}  last synced ${stamp.syncedAt ?? '?'} at v${stamp.version}`,
    );
    console.log(`              now v${live.version} (modified ${live.lastModified})`);
  } else {
    console.log(c.green(`\nOK  File unchanged since ${stamp.syncedAt ?? 'the last sync'}.`));
  }

  /* 2 - did the design system change? */
  if (stamp) {
    const changes = diff(
      { foundations: stamp.foundations, components: stamp.components },
      { foundations: live.foundations, components: live.components },
    );
    const design = changes.filter((d) => !isCopy(d.path));
    const copy = changes.filter((d) => isCopy(d.path));

    if (design.length) {
      drift = true;
      console.log(`\n${c.red(`DESIGN DRIFT (${design.length})`)}`);
      for (const d of design) {
        const owner = ownerOf(d.path);
        console.log(`  ${c.cyan(d.path)}`);
        console.log(`    ${c.red(String(d.before ?? '-'))} -> ${c.green(String(d.after ?? '-'))}`);
        if (owner) console.log(c.dim(`    ${owner.name} - ${owner.source}`));
      }
    } else {
      console.log(c.green('OK  No design drift against the baseline.'));
    }

    if (copy.length) {
      console.log(`\n${c.dim(`COPY CHANGES (${copy.length}) - placeholder text, usually ignorable`)}`);
      for (const d of copy) {
        console.log(c.dim(`  ${d.path}: ${String(d.before ?? '-')} -> ${String(d.after ?? '-')}`));
      }
    }
  }

  /* 3 - does the code match Figma? */
  const css = extractCssTokens();
  if (!css) {
    console.log(c.yellow(`\n${TOKENS_PATH} not found - skipping the code comparison.`));
  } else {
    const problems = [];
    for (const [label, cssVar] of Object.entries(COLOUR_MAP)) {
      const figmaHex = live.foundations.colors[label];
      if (!figmaHex) {
        problems.push(`${label} is no longer a labelled swatch in Foundations (drives ${cssVar})`);
        continue;
      }
      if (css[cssVar] !== figmaHex) {
        problems.push(
          `${cssVar} is ${css[cssVar] ?? 'missing'} in CSS but ${figmaHex} in Figma (${label})`,
        );
      }
    }
    if (problems.length) {
      drift = true;
      console.log(`\n${c.red(`CODE vs FIGMA (${problems.length})`)}  ${c.dim(TOKENS_PATH)}`);
      for (const p of problems) console.log(`  ${p}`);
    } else {
      console.log(c.green(`OK  Colour tokens in ${TOKENS_PATH} match Foundations.`));
    }
  }

  /* Integrity notes - worth surfacing even when nothing else drifted. */
  if (swatchMismatches.length) {
    drift = true;
    console.log(`\n${c.red('SWATCH MISMATCH')}  a swatch fill disagrees with its own label`);
    for (const m of swatchMismatches) {
      console.log(`  ${m.name}: label says ${m.label}, rectangle is filled ${m.swatch}`);
    }
  }

  if (missing.length) {
    drift = true;
    console.log(`\n${c.red('MISSING COMPONENTS')}  node ids not found in the file`);
    for (const m of missing) {
      console.log(`  ${m.id} ${m.name}  ${c.dim(m.source)}`);
      console.log(
        c.dim('    Likely deleted and redrawn, which changes the id. Update COMPONENT_NODES.'),
      );
    }
  }

  console.log(
    drift
      ? `\n${c.yellow('Drift found.')} Review above, apply what is intended, then run ` +
          `${c.bold('npm run figma:sync')} to re-baseline.\n`
      : `\n${c.green('In sync.')}\n`,
  );
  return drift ? 1 : 0;
}

/* Exported for testing; the CLI path is guarded below. */
export { diff, extractFoundations, extractCssTokens, isCopy, ownerOf };

if (import.meta.main) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(`\n${c.red('figma-sync failed')}\n  ${error.message}\n`);
      process.exit(2);
    });
}
