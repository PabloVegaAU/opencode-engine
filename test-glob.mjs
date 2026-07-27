import { posix } from 'node:path';

// Simulate the matchGlob function from ownership-classifier.mjs
function matchGlob(path, pattern) {
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // Escape special regex chars except glob chars
    .replace(/\*\*/g, '{{DOUBLE_STAR}}')    // Placeholder for **
    .replace(/\*/g, '[^/]*')               // * matches anything except /
    .replace(/\?/g, '.')                   // ? matches single char
    .replace(/\{\{DOUBLE_STAR\}\}/g, '.*'); // ** matches anything including /

  try {
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(path);
  } catch {
    return false;
  }
}

// Test with Windows-style paths (backslash)
console.log('=== Testing with backslash paths (Windows) ===');
console.log('cache\\data.json vs cache/**:', matchGlob('cache\\data.json', 'cache/**'));
console.log('cache\\data.json vs cache/*:', matchGlob('cache\\data.json', 'cache/*'));
console.log('bin\\test.sh vs bin/*:', matchGlob('bin\\test.sh', 'bin/*'));
console.log('bin\\test.sh vs bin/**:', matchGlob('bin\\test.sh', 'bin/**'));

// Test with forward slash paths (POSIX)
console.log('');
console.log('=== Testing with forward slash paths (POSIX) ===');
console.log('cache/data.json vs cache/**:', matchGlob('cache/data.json', 'cache/**'));
console.log('cache/data.json vs cache/*:', matchGlob('cache/data.json', 'cache/*'));
console.log('bin/test.sh vs bin/*:', matchGlob('bin/test.sh', 'bin/*'));
console.log('bin/test.sh vs bin/**:', matchGlob('bin/test.sh', 'bin/**'));

// Test scanDirectory normalization
console.log('');
console.log('=== Testing posix.normalize on Windows ===');
console.log('posix.normalize("cache\\\\data.json"):', posix.normalize('cache\\data.json'));
console.log('posix.normalize("bin\\\\test.sh"):', posix.normalize('bin\\test.sh'));
