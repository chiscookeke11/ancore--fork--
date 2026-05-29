#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = path.resolve(import.meta.dirname, '..');

const DOCS = ['README.md', 'docs/architecture/OVERVIEW.md'];
const MANAGED_BLOCK_START = '<!-- docs-structure-check:start -->';
const MANAGED_BLOCK_END = '<!-- docs-structure-check:end -->';
const TOP_LEVEL_IGNORES = new Set(['.cargo', '.git', '.github', '.husky', 'node_modules', 'state']);
const CHILD_MODULE_ROOTS = ['apps', 'contracts', 'packages', 'services'];

function isDirectory(relativePath) {
  try {
    return fs.statSync(path.join(repoRoot, relativePath)).isDirectory();
  } catch {
    return false;
  }
}

function listDirectories(relativePath) {
  return fs
    .readdirSync(path.join(repoRoot, relativePath), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith('.') && name !== 'node_modules' && name !== 'target')
    .sort((a, b) => a.localeCompare(b));
}

function requiredModulePaths() {
  const paths = listDirectories('.')
    .filter((name) => !TOP_LEVEL_IGNORES.has(name))
    .map((name) => `${name}/`);

  for (const root of CHILD_MODULE_ROOTS) {
    if (!isDirectory(root)) continue;
    for (const child of listDirectories(root)) {
      paths.push(`${root}/${child}/`);
    }
  }

  return [...new Set(paths)].sort((a, b) => a.localeCompare(b));
}

function managedBlock(content, docPath) {
  const start = content.indexOf(MANAGED_BLOCK_START);
  const end = content.indexOf(MANAGED_BLOCK_END);

  if (start === -1 || end === -1 || end <= start) {
    throw new Error(
      `${docPath} must contain a docs structure block delimited by ${MANAGED_BLOCK_START} and ${MANAGED_BLOCK_END}.`
    );
  }

  return content.slice(start + MANAGED_BLOCK_START.length, end);
}

function documentedPaths(block) {
  const paths = new Set([...block.matchAll(/`([^`]+\/)`/g)].map((match) => match[1]));
  const treeStack = [];

  for (const line of block.split('\n')) {
    const treeMatch = line.match(/^(?<indent>[│\s]*)(?:├──|└──)\s+(?<name>[^\s#]+\/)\s*/u);
    if (!treeMatch) continue;

    const name = treeMatch.groups.name;
    if (name === 'ancore/') continue;

    const depth = Math.floor(treeMatch.groups.indent.length / 4);
    treeStack[depth] = name.replace(/\/$/, '');
    treeStack.length = depth + 1;
    paths.add(`${treeStack.join('/')}/`);
  }

  return [...paths];
}

let failed = false;
const required = requiredModulePaths();

for (const docPath of DOCS) {
  const absoluteDocPath = path.join(repoRoot, docPath);
  const content = fs.readFileSync(absoluteDocPath, 'utf8');
  let block;

  try {
    block = managedBlock(content, docPath);
  } catch (error) {
    failed = true;
    console.error(`❌ ${error.message}`);
    continue;
  }

  const documented = [...new Set(documentedPaths(block))].sort((a, b) => a.localeCompare(b));
  const missingFromDocs = required.filter((modulePath) => !documented.includes(modulePath));
  const missingOnDisk = documented.filter(
    (modulePath) => !isDirectory(modulePath.replace(/\/$/, ''))
  );

  if (missingFromDocs.length > 0 || missingOnDisk.length > 0) {
    failed = true;
    console.error(`❌ ${docPath} is out of sync with the repository structure.`);

    if (missingFromDocs.length > 0) {
      console.error('   Required module paths missing from the documented structure:');
      for (const modulePath of missingFromDocs) console.error(`   - ${modulePath}`);
    }

    if (missingOnDisk.length > 0) {
      console.error('   Documented module paths that do not exist on disk:');
      for (const modulePath of missingOnDisk) console.error(`   - ${modulePath}`);
    }
  } else {
    console.log(`✅ ${docPath} matches the repository structure block.`);
  }
}

if (failed) {
  console.error(
    '\nUpdate the docs structure blocks or adjust scripts/check-docs-structure.mjs when intentional repository structure changes occur.'
  );
  process.exit(1);
}
