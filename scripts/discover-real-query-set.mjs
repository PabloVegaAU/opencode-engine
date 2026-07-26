/**
 * Real Query Set Discovery v3 (fast, no file reads)
 *
 * Strategy:
 * - exact: use git grep -c for known identifiers (trial-based)
 * - symbol: git grep for public class declarations
 * - knowledge: read headings from governance files, git grep for the phrase
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, basename } from 'node:path';

const SOURCE = process.argv[2] || 'C:/quipusoft';
const CWD = process.cwd();

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024, timeout: 60000 });
}

function count(cwd, pattern) {
  try {
    // --cached: only committed content, not dirty worktree (matches pilot clone state)
    const out = git(['grep', '-I', '-c', '--cached', pattern, '--', '.'], cwd);
    return out.split(/\r?\n/).filter(Boolean).reduce((s, l) => {
      const m = l.match(/:(\d+)$/);
      return s + (m ? parseInt(m[1]) : 1);
    }, 0);
  } catch { return 0; }
}

function anchors(cwd, pattern, limit = 3) {
  try {
    return git(['grep', '-I', '-n', '--cached', pattern, '--', '.'], cwd)
      .split(/\r?\n/).filter(Boolean).slice(0, limit).map(l => {
        const m = l.match(/^([^:]+):(\d+):(.*)$/);
        return m ? { path: m[1], line: parseInt(m[2]), text: m[3].trim().substring(0, 100) } : null;
      }).filter(Boolean);
  } catch { return []; }
}

function discoverExact(cwd) {
  // Known identifiers from a standard Java Spring boot project
  const candidates = [
    '\\bAppController\\b', '\\bUserService\\b', '\\bUserController\\b',
    '\\bSecurityConfig\\b', '\\bJwtUtil\\b', '\\bTokenProvider\\b',
    '\\bApiResponse\\b', '\\bBaseEntity\\b', '\\bGlobalExceptionHandler\\b',
    '\\bApplicationConfig\\b', '\\bWebMvcConfig\\b', '\\bCorsConfig\\b',
    '\\bAuthController\\b', '\\bLoginRequest\\b', '\\bSignUpRequest\\b',
    '\\bPersistenceConfig\\b', '\\bDataSourceConfig\\b', '\\bFlywayConfig\\b',
    '\\bRestTemplateConfig\\b', '\\bSwaggerConfig\\b', '\\bOpenApiConfig\\b'
  ];
  for (const p of candidates) {
    const label = p.replace(/^\\b/, '').replace(/\\b$/, '');
    const total = count(cwd, p);
    if (total >= 2 && total <= 100) {
      return { intent: 'exact', query: label, match_count: total, anchors: anchors(cwd, p, 3),
        criterion: 'known Spring Boot identifier with 2-100 matches' };
    }
  }
  // Fallback: find any Java identifier using a quick grep
  // Try common type names (not String/Integer etc.)
  try {
    const raw = git(['grep', '-I', '-h', '-o', '--cached', '\\b[A-Z][a-zA-Z0-9]{5,25}\\b', '--', '*.java'], cwd);
    const ids = raw.split(/\r?\n/).filter(Boolean);
    const freq = new Map();
    for (const id of ids) {
      if (['String','Integer','Boolean','Object','Exception','RuntimeException','ArrayList','HashMap','Optional','Collectors','ResponseEntity','PathVariable','RequestBody','RequestParam','Autowired','Value','Override','GetMapping','PostMapping','PutMapping','DeleteMapping','CrossOrigin','JsonIgnore','JsonFormat','JsonProperty','Transactional','Service','Repository','Component','Configuration','RestController','RequestMapping','Logger','LoggerFactory','Serializable','Cloneable','Comparable'].includes(id)) continue;
      freq.set(id, (freq.get(id) || 0) + 1);
    }
    const sorted = [...freq.entries()].filter(([,c]) => c >= 2 && c <= 100).sort((a,b) => b[1]-a[1]||a[0].localeCompare(b[0]));
    if (sorted.length > 0) return {
      intent: 'exact', query: sorted[0][0],
      match_count: count(cwd, '\\b' + sorted[0][0] + '\\b'),
      anchors: anchors(cwd, '\\b' + sorted[0][0] + '\\b', 3),
      criterion: 'Java type identifier with 2-100 occurrences in *.java files' };
  } catch {}
  return null;
}

function discoverSymbol(cwd) {
  try {
    const raw = git(['grep', '-I', '-n', '--cached', '^public\\s\\+(abstract\\s\\+)?\\(class\\|interface\\|enum\\)\\s\\+\\w\\+', '--', '*.java'], cwd);
    // Actually, use a simpler pattern for git grep
  } catch {}
  try {
    const lines = git(['grep', '-I', '-n', '--cached', '^public ', '--', '*.java'], cwd)
      .split(/\r?\n/).filter(l => /(class|interface|enum)\s+\w/.test(l));
    const candidates = new Map();
    for (const l of lines) {
      const m = l.match(/(class|interface|enum)\s+(\w+)/);
      if (m) {
        const name = m[2];
        if (!candidates.has(name)) candidates.set(name, { name, line: l });
      }
    }
    const scored = [];
    for (const [name] of candidates) {
      const total = count(cwd, '\\b' + name + '\\b');
      if (total >= 3) scored.push({ name, total });
    }
    scored.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    if (scored.length === 0) return null;
    const best = scored[0];
    return {
      intent: 'symbol', query: 'class ' + best.name,
      match_count: best.total,
      anchors: anchors(cwd, '\\b' + best.name + '\\b', 3),
      criterion: 'public class/interface/enum declaration with >=3 references, most matches first'
    };
  } catch { return null; }
}

function discoverKnowledge(projRoot) {
  const govFiles = ['AGENTS.md', 'README.md', 'PROGRESS.md', 'CHANGELOG.md'];
  const phrases = [];
  for (const gf of govFiles) {
    const p = join(projRoot, gf);
    if (!existsSync(p)) continue;
    try {
      const content = readFileSync(p, 'utf8');
      for (const line of content.split(/\r?\n/)) {
        const hm = line.match(/^#{1,3}\s+(.+)$/);
        if (!hm) continue;
        const h = hm[1].trim();
        const words = h.split(/\s+/);
        if (words.length < 2) continue;
        // Take first 2-3 words
        const phrase = words.slice(0, Math.min(3, words.length)).join(' ');
        if (phrase.length >= 5 && /[a-z]/i.test(phrase)) phrases.push(phrase);
      }
    } catch {}
  }
  const unique = [...new Set(phrases)];
  const scored = unique.map(p => ({ phrase: p, total: count(projRoot, '\\b' + p + '\\b') }))
    .filter(c => c.total >= 2)
    .sort((a, b) => b.total - a.total || a.phrase.localeCompare(b.phrase));
  if (scored.length === 0) return null;
  const best = scored[0];
  return {
    intent: 'knowledge', query: best.phrase,
    match_count: best.total,
    anchors: anchors(projRoot, '\\b' + best.phrase + '\\b', 3),
    criterion: 'heading phrase (2-3 words) from governance files, >=2 matches, most matches first'
  };
}

function main() {
  const manifestPath = join(SOURCE, 'project-manifest.json');
  if (!existsSync(manifestPath)) { console.error('Missing', manifestPath); process.exit(1); }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const repos = manifest.repositories.sort((a, b) => a.repository_id.localeCompare(b.repository_id))
    .map(r => ({ id: r.repository_id, path: r.path === '.' ? SOURCE : join(SOURCE, r.path) }));
  const primary = repos.find(r => r.id !== 'root' && existsSync(r.path)) || repos[0];
  console.log('Primary:', primary.id, primary.path);

  console.log('Exact...');
  const exact = discoverExact(primary.path);
  if (exact) console.log(' =>', exact.query, '(' + exact.match_count + ')');

  console.log('Symbol...');
  const symbol = discoverSymbol(primary.path);
  if (symbol) console.log(' =>', symbol.query, '(' + symbol.match_count + ')');

  console.log('Knowledge...');
  const knowledge = discoverKnowledge(SOURCE);
  if (knowledge) console.log(' =>', knowledge.query, '(' + knowledge.match_count + ')');

  if (!exact || !symbol || !knowledge) {
    console.error('Discovery incomplete:', { exact: !!exact, symbol: !!symbol, knowledge: !!knowledge });
    process.exit(1);
  }

  const queries = [exact, symbol, knowledge];
  const queryPairs = queries.flatMap(q => [{ query: q.query, intent: q.intent }, { query: q.query, intent: q.intent }]);
  const hash = createHash('sha256').update(JSON.stringify(queryPairs)).digest('hex');

  const commits = {};
  for (const r of repos) { try { commits[r.id] = git(['rev-parse', 'HEAD'], r.path).trim(); } catch {} }

  const result = {
    schema_version: '1.0', methodology: 'deterministic real-source query discovery via git grep (v3, no file reads)',
    discovered_at: new Date().toISOString(), source_project: SOURCE, primary_repository: primary.id,
    query_set_hash: hash, queries: queryPairs, query_descriptions: queries, repository_commits: commits
  };

  const outDir = join(CWD, 'docs/research/sources');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, '2026-07-26-retrieval-real-query-set.json'), JSON.stringify(result, null, 2));
  console.log('Done. hash:', hash);
}

main();