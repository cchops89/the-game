#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const Anthropic = require('@anthropic-ai/sdk').default;

// ── CLI flags ──────────────────────────────────────────────
const DRY_RUN = process.argv.includes('--dry-run');
const ROOT = __dirname;

const FILES = {
  dna:         path.join(ROOT, 'GAME-DNA.md'),
  reference:   path.join(ROOT, 'GAME-REFERENCE.md'),
  submissions: path.join(ROOT, 'submissions.md'),
  index:       path.join(ROOT, 'index.html'),
};

// ── Section name map (tool enum → banner text in index.html) ──
const SECTION_MAP = {
  'CONFIG':              'CONFIG',
  'SKETCH_HELPERS':      'SKETCH HELPERS',
  'CANVAS':              'CANVAS',
  'STATE':               'STATE',
  'INPUT':               'INPUT',
  'UPGRADES':            'UPGRADES',
  'PLAYER_UPDATE':       'PLAYER UPDATE',
  'ENEMIES':             'ENEMIES',
  'PROJECTILES':         'PROJECTILES',
  'KILL_XP':             'KILL / XP',
  'PARTICLES':           'PARTICLES',
  'DRAW':                'DRAW',
  'HUD':                 'HUD',
  'GAME_OVER':           'GAME OVER',
  'AUDIO':               'AUDIO',
  'DEXSCREENER_GROWTH':  'DEXSCREENER + GROWTH SYSTEM',
  'GAME_LOOP':           'GAME LOOP',
  'START_RESTART':       'START / RESTART',
  'INIT':                'INIT',
};

const SECTION_BANNER_RE = /^\s*\/\/ =+ (.+?) =+\s*$/;

// ── Tool schema for Claude ─────────────────────────────────
const MUTATION_TOOL = {
  name: 'apply_mutation',
  description:
    'Apply a mutation to the game. Provide the new version, summary, and the COMPLETE replacement content for each modified code section. Section content must NOT include the section banner comment — it is preserved automatically.',
  input_schema: {
    type: 'object',
    required: ['versionNumber', 'versionType', 'summary', 'changelog', 'sectionChanges', 'referenceDoc'],
    properties: {
      versionNumber: {
        type: 'string',
        description: 'New version number, e.g. "0.02" or "1.00"',
      },
      versionType: {
        type: 'string',
        enum: ['MAJOR', 'MINOR'],
        description: 'Whether this is a major or minor version bump',
      },
      summary: {
        type: 'string',
        description: '1-2 sentence description of what changed',
      },
      changelog: {
        type: 'string',
        description: 'Timeline entry, e.g. "v0.02 — bosses arrive"',
      },
      sectionChanges: {
        type: 'array',
        description:
          'Array of section replacements. Each item replaces the FULL body content of a named section (everything between its banner and the next banner). Provide ONLY sections you are modifying.',
        items: {
          type: 'object',
          required: ['sectionName', 'content'],
          properties: {
            sectionName: {
              type: 'string',
              enum: Object.keys(SECTION_MAP),
              description: 'The section identifier to replace',
            },
            content: {
              type: 'string',
              description:
                'The complete new content for this section. Do NOT include the section banner comment — it is preserved automatically. Include proper indentation (4 spaces).',
            },
          },
        },
      },
      referenceDoc: {
        type: 'string',
        description: 'The complete updated GAME-REFERENCE.md content',
      },
    },
  },
};

// ── Section parser ─────────────────────────────────────────
function parseIntoSections(html) {
  const lines = html.split('\n');
  const sections = [];
  let currentSection = null;
  const preScriptLines = [];
  let postScriptLines = [];
  let inPreamble = true;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(SECTION_BANNER_RE);

    if (match) {
      inPreamble = false;
      if (currentSection) sections.push(currentSection);
      currentSection = {
        bannerLine: lines[i],
        bannerName: match[1],
        bodyLines: [],
      };
    } else if (currentSection) {
      if (lines[i].trim() === '</script>') {
        sections.push(currentSection);
        currentSection = null;
        postScriptLines = lines.slice(i);
        break;
      }
      currentSection.bodyLines.push(lines[i]);
    } else if (inPreamble) {
      preScriptLines.push(lines[i]);
    }
  }

  // If we never hit </script> (shouldn't happen), close last section
  if (currentSection) sections.push(currentSection);

  return { preScriptLines, sections, postScriptLines };
}

// ── Section applier ────────────────────────────────────────
function applySectionChanges(html, sectionChanges) {
  const parsed = parseIntoSections(html);

  for (const change of sectionChanges) {
    const bannerName = SECTION_MAP[change.sectionName];
    if (!bannerName) throw new Error(`Unknown section name: ${change.sectionName}`);

    const section = parsed.sections.find((s) => s.bannerName === bannerName);
    if (!section) throw new Error(`Section not found in index.html: "${bannerName}"`);

    section.bodyLines = change.content.split('\n');
  }

  const allLines = [
    ...parsed.preScriptLines,
    ...parsed.sections.flatMap((s) => [s.bannerLine, ...s.bodyLines]),
    ...parsed.postScriptLines,
  ];

  return allLines.join('\n');
}

// ── Version helpers ────────────────────────────────────────
function getCurrentVersion(html) {
  const m = html.match(/Arena Survivor v(\d+\.\d+)/);
  return m ? m[1] : '0.00';
}

function updateVersionString(html, newVersion) {
  return html.replace(/Arena Survivor v[\d.]+/g, `Arena Survivor v${newVersion}`);
}

// ── Validation ─────────────────────────────────────────────
function validate(html) {
  const errors = [];

  if (!html.includes('</script>')) errors.push('Missing </script> tag');
  if (!html.includes('</html>')) errors.push('Missing </html> tag');

  // Check all section banners still present
  for (const bannerName of Object.values(SECTION_MAP)) {
    if (!html.includes(bannerName)) {
      errors.push(`Missing section banner: "${bannerName}"`);
    }
  }

  // Line count
  const lineCount = html.split('\n').length;
  if (lineCount > 4000) errors.push(`File too large: ${lineCount} lines (max 4000)`);

  // Simple brace balance inside <script>
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
  if (scriptMatch) {
    const js = scriptMatch[1];
    let braces = 0;
    for (const ch of js) {
      if (ch === '{') braces++;
      if (ch === '}') braces--;
    }
    if (braces !== 0) errors.push(`Brace imbalance in <script>: ${braces > 0 ? '+' : ''}${braces}`);
  }

  return errors;
}

// ── Git helpers ────────────────────────────────────────────
function gitCommit(version, summary) {
  try {
    execSync('git add index.html GAME-REFERENCE.md', { cwd: ROOT, stdio: 'pipe' });
    const msg = `v${version}: ${summary}`;
    execSync(`git commit -m "${msg.replace(/"/g, '\\"')}"`, { cwd: ROOT, stdio: 'pipe' });
    console.log(`  Git commit: ${msg}`);
  } catch (err) {
    console.warn('  Warning: git commit failed —', err.message);
    console.warn('  Files were written but not committed. You can commit manually.');
  }
}

// ── Main ───────────────────────────────────────────────────
async function main() {
  console.log(`\n$GAME Mutation Bot ${DRY_RUN ? '(DRY RUN)' : ''}`);
  console.log('─'.repeat(50));

  // 1. Read & validate files
  for (const [name, filePath] of Object.entries(FILES)) {
    if (!fs.existsSync(filePath)) {
      console.error(`Error: ${name} not found at ${filePath}`);
      process.exit(1);
    }
  }

  const dnaContent = fs.readFileSync(FILES.dna, 'utf-8');
  const referenceContent = fs.readFileSync(FILES.reference, 'utf-8');
  const submissionsContent = fs.readFileSync(FILES.submissions, 'utf-8');
  const indexHtml = fs.readFileSync(FILES.index, 'utf-8');

  // Check submissions has actual content (not just the template header)
  const submissionLines = submissionsContent
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#') && !l.startsWith('<!--'));
  if (submissionLines.length === 0) {
    console.error('Error: No submissions found in submissions.md');
    console.error('Add player submissions (one per line) and run again.');
    process.exit(1);
  }

  const currentVersion = getCurrentVersion(indexHtml);
  console.log(`  Current version: v${currentVersion}`);
  console.log(`  Submissions: ${submissionLines.length} line(s)`);

  // 2. Verify API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY environment variable not set.');
    console.error('  export ANTHROPIC_API_KEY=sk-ant-...');
    process.exit(1);
  }

  // 3. Call Claude API
  const model = process.env.MUTATE_MODEL || 'claude-sonnet-4-20250514';
  console.log(`  Model: ${model}`);
  console.log('  Calling Claude API...');

  const userMessage = [
    '## Current Game State (GAME-REFERENCE.md)\n',
    referenceContent,
    '\n---\n',
    '## Player Submissions\n',
    submissionsContent,
    '\n---\n',
    'Follow the Mutation Workflow from your system prompt. Output your mutation using the `apply_mutation` tool.',
    `The current version is v${currentVersion}.`,
  ].join('\n');

  const client = new Anthropic();

  let response;
  try {
    response = await client.messages.create({
      model,
      max_tokens: 16000,
      system: dnaContent,
      messages: [{ role: 'user', content: userMessage }],
      tools: [MUTATION_TOOL],
      tool_choice: { type: 'tool', name: 'apply_mutation' },
    });
  } catch (err) {
    console.error('Error calling Claude API:', err.message);
    process.exit(1);
  }

  // 4. Extract mutation
  const toolBlock = response.content.find((b) => b.type === 'tool_use');
  if (!toolBlock) {
    console.error('Error: Claude did not return a tool_use block.');
    console.error('Response:', JSON.stringify(response.content, null, 2));
    process.exit(1);
  }

  const mutation = toolBlock.input;
  console.log('\n  Mutation received:');
  console.log(`    Version: v${mutation.versionNumber} (${mutation.versionType})`);
  console.log(`    Summary: ${mutation.summary}`);
  console.log(`    Changelog: ${mutation.changelog}`);
  console.log(`    Sections modified: ${mutation.sectionChanges.map((s) => s.sectionName).join(', ')}`);

  // 5. Apply in-memory
  let newHtml;
  try {
    newHtml = applySectionChanges(indexHtml, mutation.sectionChanges);
    newHtml = updateVersionString(newHtml, mutation.versionNumber);
  } catch (err) {
    console.error(`\nError applying section changes: ${err.message}`);
    process.exit(1);
  }

  // 6. Validate
  const errors = validate(newHtml);
  if (errors.length > 0) {
    console.error('\n  Validation errors:');
    errors.forEach((e) => console.error(`    - ${e}`));
    if (!DRY_RUN) {
      console.error('\n  Aborting — no files were modified.');
      process.exit(1);
    }
  }

  const newLineCount = newHtml.split('\n').length;
  console.log(`\n  Result: ${newLineCount} lines (${errors.length === 0 ? 'valid' : 'ERRORS'})`);

  // 7. Dry run → exit
  if (DRY_RUN) {
    console.log('\n  DRY RUN — no files were modified.');
    console.log('\n  Section details:');
    for (const sc of mutation.sectionChanges) {
      const lines = sc.content.split('\n').length;
      console.log(`    ${sc.sectionName}: ${lines} lines`);
    }
    process.exit(0);
  }

  // 8. Archive if MAJOR
  if (mutation.versionType === 'MAJOR') {
    const archivePath = path.join(ROOT, 'versions', `v${currentVersion}.html`);
    fs.copyFileSync(FILES.index, archivePath);
    console.log(`  Archived: ${archivePath}`);
  }

  // 9. Backup + write
  const bakPath = FILES.index + '.bak';
  fs.copyFileSync(FILES.index, bakPath);

  try {
    fs.writeFileSync(FILES.index, newHtml, 'utf-8');
    fs.writeFileSync(FILES.reference, mutation.referenceDoc, 'utf-8');
    console.log('  Written: index.html');
    console.log('  Written: GAME-REFERENCE.md');
  } catch (err) {
    console.error('Error writing files:', err.message);
    console.error('Restoring backup...');
    fs.copyFileSync(bakPath, FILES.index);
    process.exit(1);
  }

  // Clean up backup
  fs.unlinkSync(bakPath);

  // 10. Git commit
  gitCommit(mutation.versionNumber, mutation.summary);

  console.log('\n  Mutation applied successfully.');
  console.log(`  ${mutation.changelog}`);
  console.log('─'.repeat(50) + '\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
