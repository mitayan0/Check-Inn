import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Polyfill for __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const url = "https://nodejs.org/dist/v20.11.0/win-x64/node.exe";
const dest = path.join(__dirname, '../sidecar/node.exe');

if (fs.existsSync(dest)) {
  console.log(`Node.exe already exists at ${dest}. Skipping download.`);
  process.exit(0);
}

console.log(`Downloading ${url} to ${dest}...`);

const file = fs.createWriteStream(dest);
https.get(url, function (response) {
  response.pipe(file);
  file.on('finish', function () {
    file.close(() => {
      console.log("Download completed.");
    });
  });
}).on('error', function (err) {
  if (fs.existsSync(dest)) {
    try {
      fs.unlinkSync(dest);
    } catch (e) {
      // Ignore error if file is busy
    }
  }
  console.error("Error downloading:", err.message);
  process.exit(1);
});
