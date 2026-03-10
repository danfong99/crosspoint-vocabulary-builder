/**
 * Download WordNet 3.1 database files and build a dictionary JSON
 * for the Crosspoint dictionary prototype.
 *
 * WordNet is a public domain lexical database from Princeton University.
 * https://wordnet.princeton.edu/
 *
 * Usage: node build-dictionary.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { createUnzip } = require('zlib');

const OUTPUT_PATH = path.join(__dirname, 'dictionary.json');
const WORDNET_DIR = path.join(__dirname, 'wordnet-data');

// WordNet database files hosted on various mirrors
// We'll download the dict/ files directly from the WordNet release
const WORDNET_TAR_URL = 'https://wordnetcode.princeton.edu/wn3.1.dict.tar.gz';

function download(url) {
  return new Promise((resolve, reject) => {
    const follow = (u) => {
      https.get(u, { headers: { 'User-Agent': 'CrosspointDictBuilder/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          follow(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${u}`));
          return;
        }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    };
    follow(url);
  });
}

// ── Minimal tar parser (ustar format) ──
function parseTar(buffer) {
  const files = {};
  let offset = 0;

  while (offset < buffer.length - 512) {
    // Check for end-of-archive (two zero blocks)
    const header = buffer.slice(offset, offset + 512);
    if (header.every(b => b === 0)) break;

    const name = header.toString('utf-8', 0, 100).replace(/\0.*/, '');
    const sizeStr = header.toString('utf-8', 124, 136).replace(/\0.*/, '').trim();
    const size = parseInt(sizeStr, 8) || 0;

    offset += 512; // skip header

    if (size > 0 && name && !name.endsWith('/')) {
      files[name] = buffer.slice(offset, offset + size);
    }

    // Data blocks are padded to 512-byte boundary
    offset += Math.ceil(size / 512) * 512;
  }

  return files;
}

// ── Decompress gzip ──
function gunzip(buffer) {
  return new Promise((resolve, reject) => {
    require('zlib').gunzip(buffer, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

// ── Parse WordNet data.{noun,verb,adj,adv} files ──
function parseDataFile(content, posLabel) {
  const entries = [];
  const lines = content.toString('utf-8').split('\n');

  for (const line of lines) {
    // Skip copyright header lines (start with spaces)
    if (line.startsWith('  ') || line.trim() === '') continue;

    // Format: synset_offset lex_filenum ss_type w_cnt word lex_id [word lex_id...] p_cnt [ptr...] | gloss
    const glossSplit = line.indexOf('| ');
    if (glossSplit === -1) continue;

    const dataPart = line.substring(0, glossSplit);
    const gloss = line.substring(glossSplit + 2).trim();

    // Extract words from the data part
    const tokens = dataPart.trim().split(/\s+/);
    if (tokens.length < 6) continue;

    const ssType = tokens[2]; // n=noun, v=verb, a/s=adj, r=adv
    const wordCount = parseInt(tokens[3], 16);

    const words = [];
    for (let i = 0; i < wordCount; i++) {
      const wordIdx = 4 + i * 2;
      if (wordIdx < tokens.length) {
        words.push(tokens[wordIdx].replace(/_/g, ' ').toLowerCase());
      }
    }

    for (const word of words) {
      entries.push({ word, type: posLabel, definition: gloss });
    }
  }

  return entries;
}

async function main() {
  console.log('Downloading WordNet 3.1 dictionary data...');
  console.log('(This is a ~4MB download from Princeton University)\n');

  let tarBuffer;
  try {
    const gzBuffer = await download(WORDNET_TAR_URL);
    console.log(`Downloaded ${(gzBuffer.length / 1024 / 1024).toFixed(1)} MB`);

    tarBuffer = await gunzip(gzBuffer);
    console.log(`Decompressed to ${(tarBuffer.length / 1024 / 1024).toFixed(1)} MB`);
  } catch (e) {
    console.error('Download failed:', e.message);
    console.log('\nTrying alternative: building from bundled .mobi extraction...');
    process.exit(1);
  }

  // Parse tar
  const files = parseTar(tarBuffer);
  console.log(`\nFound ${Object.keys(files).length} files in archive:`);
  for (const name of Object.keys(files)) {
    console.log(`  ${name} (${(files[name].length / 1024).toFixed(0)} KB)`);
  }

  // Find the data files
  const posMap = {
    'data.noun': 'noun',
    'data.verb': 'verb',
    'data.adj': 'adjective',
    'data.adv': 'adverb',
  };

  const allEntries = [];
  for (const [filename, posLabel] of Object.entries(posMap)) {
    // Find the file in tar (may be nested in a directory)
    const key = Object.keys(files).find(k => k.endsWith('/' + filename) || k === filename);
    if (!key) {
      console.warn(`Warning: ${filename} not found in archive`);
      continue;
    }

    console.log(`\nParsing ${key}...`);
    const entries = parseDataFile(files[key], posLabel);
    console.log(`  Found ${entries.length} sense entries`);
    for (const e of entries) allEntries.push(e);
  }

  // ── Merge entries by word ──
  // Group all senses for each word
  const dictionary = Object.create(null);
  for (const entry of allEntries) {
    const word = entry.word;
    if (!word || !entry.definition) continue;

    if (!dictionary[word]) {
      dictionary[word] = {
        type: entry.type || '',
        definitions: [entry.definition]
      };
    } else {
      // Add part of speech if new
      const existing = dictionary[word];
      if (entry.type && existing.type && !existing.type.includes(entry.type)) {
        existing.type += ', ' + entry.type;
      }
      // Add definition if not duplicate (limit to 3 per word to save space)
      if (existing.definitions.length < 3 &&
          !existing.definitions.includes(entry.definition)) {
        existing.definitions.push(entry.definition);
      }
    }
  }

  // Flatten definitions into a single string
  const finalDict = {};
  for (const [word, data] of Object.entries(dictionary)) {
    // Skip multi-word phrases for the prototype (device selects single words)
    if (word.includes(' ')) continue;

    if (data.definitions.length === 1) {
      finalDict[word] = { t: data.type, d: data.definitions[0] };
    } else {
      finalDict[word] = {
        t: data.type,
        d: data.definitions.map((d, i) => `${i + 1}. ${d}`).join(' ')
      };
    }
  }

  const wordCount = Object.keys(finalDict).length;
  console.log(`\n── Result ──`);
  console.log(`Total unique words: ${wordCount}`);

  // Show samples
  const samples = ['vulnerable', 'advice', 'curious', 'read', 'book', 'dictionary'];
  console.log('\nSample entries:');
  for (const s of samples) {
    if (finalDict[s]) {
      console.log(`  ${s} (${finalDict[s].t}): ${finalDict[s].d.substring(0, 80)}...`);
    }
  }

  // Write output
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(finalDict));
  const sizeMB = (fs.statSync(OUTPUT_PATH).size / 1024 / 1024).toFixed(1);
  console.log(`\nSaved to dictionary.json (${sizeMB} MB, ${wordCount} words)`);
}

main().catch(console.error);
