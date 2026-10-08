import path from 'path';
import { pathToFileURL } from 'url';

const cliPath = path.resolve('node_modules/vite/dist/node/cli.js');
const escapedUrl = pathToFileURL(cliPath).href.replace("'", "%27");

console.log('Testing import from:', escapedUrl);

try {
  const mod = await import(escapedUrl);
  console.log('Import successful!');
} catch (e) {
  console.error('Import failed:', e);
}
