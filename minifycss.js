const fs = require('fs');

const args = process.argv.slice(2);
const inputPath = args[0];
const outputPath = args[1];

try {
  const css = fs.readFileSync(inputPath, 'utf8');

  const minified = css
    .replace(/[\n|\r]/g, ' ')            // Remove newlines
    .replace(/\s+/g, ' ')                // Collapse multiple spaces
    .replace(/(;|:|,|{|}|>) /g, '$1')    // Remove space after delimiters
    .replace(/(;| )({|}|>)/g, '$2')      // Remove space/semicolon before delimiters
    .trim();

  fs.writeFileSync(outputPath, minified);
} catch (err) {
  console.error('Error processing CSS:', err.message);
  process.exit(1);
}
