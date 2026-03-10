/**
 * Extract dictionary entries from an MDict .mdx file using js-mdict
 * and output as dictionary.json for the prototype.
 *
 * Usage: node extract-mdx.js
 */

const { MDX } = require('js-mdict');
const fs = require('fs');
const path = require('path');

const MDX_PATH = path.join(__dirname, 'New Oxford American Dictionary, 3rd Edition.mdx');
const OUTPUT_PATH = path.join(__dirname, 'dictionary.json');

console.log('Loading MDX file...');
const dict = new MDX(MDX_PATH);

// Get basic info
const header = dict.header || {};
console.log('Header:', JSON.stringify(header, null, 2).substring(0, 500));

// Try to get all keys/entries
console.log('\nExtracting entries...');

// js-mdict provides lookup and prefix methods
// We need to iterate all entries - check available methods
console.log('Available methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(dict)).filter(m => !m.startsWith('_')));

// Try to get the key list
let keys;
if (typeof dict.keys === 'function') {
  keys = dict.keys();
} else if (typeof dict.keyList === 'function') {
  keys = dict.keyList();
} else if (dict._keyList) {
  keys = dict._keyList;
} else if (dict.keyData) {
  keys = dict.keyData;
}

if (keys) {
  console.log(`Found ${keys.length} keys`);
  console.log('First 5 keys:', keys.slice(0, 5));
} else {
  console.log('No direct key access. Trying alternative approach...');

  // Try prefix search with alphabet to get all words
  const allEntries = new Map();

  // Search through two-letter prefixes for complete coverage
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  const prefixes = [];

  // Generate all two-letter prefixes
  for (const a of alphabet) {
    for (const b of alphabet) {
      prefixes.push(a + b);
    }
  }
  // Also add single letters for any entries that start with a single letter
  for (const a of alphabet) {
    prefixes.push(a);
  }

  let prefixCount = 0;
  for (const prefix of prefixes) {
    try {
      const results = dict.prefix(prefix);
      if (results && results.length > 0) {
        for (const r of results) {
          const word = (r.keyText || r.key || r.entry || '').trim().toLowerCase();
          if (word && !allEntries.has(word)) {
            allEntries.set(word, null); // definitions fetched later
          }
        }
      }
    } catch (e) {
      // skip
    }
    prefixCount++;
    if (prefixCount % 50 === 0) {
      process.stdout.write(`\r  Prefixes: ${prefixCount}/${prefixes.length} (${allEntries.size} unique words)`);
    }
  }
  process.stdout.write(`\r  Prefixes: ${prefixes.length}/${prefixes.length} (${allEntries.size} unique words)\n`);

  console.log(`\n\nTotal entries found: ${allEntries.size}`);
  keys = [...allEntries.keys()];
}

// Look up definitions and build dictionary
console.log('\nBuilding dictionary...');
const dictionary = Object.create(null);
let extracted = 0;

const wordsToProcess = keys || [];
for (let i = 0; i < wordsToProcess.length; i++) {
  const word = (typeof wordsToProcess[i] === 'string')
    ? wordsToProcess[i].trim().toLowerCase()
    : (wordsToProcess[i]?.keyText || wordsToProcess[i]?.key || '').trim().toLowerCase();

  if (!word || !/^[a-z]/i.test(word) || word.startsWith('@@@')) continue;
  if (dictionary[word]) continue;

  try {
    const result = dict.lookup(word);
    let defStr = '';

    if (typeof result === 'string') {
      defStr = result;
    } else if (result?.definition) {
      defStr = result.definition;
    } else if (result?.def) {
      defStr = result.def;
    }

    if (!defStr) continue;

    // Clean HTML
    let cleanDef = defStr
      .replace(/\0/g, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
      .replace(/&#x[0-9a-f]+;/gi, '').replace(/&#\d+;/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (cleanDef.length < 3) continue;

    let type = '';
    const posMatch = cleanDef.match(/\b(noun|verb|adjective|adverb|pronoun|preposition|conjunction|interjection|abbreviation|prefix|suffix|determiner|exclamation)\b/i);
    if (posMatch) type = posMatch[1].toLowerCase();

    dictionary[word] = { t: type, d: cleanDef };
    extracted++;
  } catch (e) {
    // skip
  }

  if (i % 2000 === 0) {
    process.stdout.write(`\r  ${i}/${wordsToProcess.length} processed (${extracted} extracted)`);
  }
}

console.log(`\r  Done: ${extracted} entries extracted`);

// Write output
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(dictionary));
const sizeMB = (fs.statSync(OUTPUT_PATH).size / 1024 / 1024).toFixed(1);
console.log(`\nSaved to dictionary.json: ${extracted} entries, ${sizeMB} MB`);

// Samples
const samples = ['vulnerable', 'advice', 'curious', 'read', 'book', 'dictionary', 'love', 'run'];
console.log('\nSample entries:');
for (const s of samples) {
  if (dictionary[s]) {
    console.log(`  ${s} (${dictionary[s].t || '?'}): ${dictionary[s].d.substring(0, 120)}...`);
  } else {
    console.log(`  ${s}: NOT FOUND`);
  }
}
