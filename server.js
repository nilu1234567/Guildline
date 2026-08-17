const express = require('express');
const path    = require('path');
const cors    = require('cors');

// megajs for MEGA folder access
const { File } = require('megajs');

const app  = express();
const PORT = process.env.PORT || 3000;

// ====================================================================
// MEGA FOLDER LINK  (publicly shared folder with district/tehsil PDFs)
// Structure inside: DistrictName/TehsilName.pdf
// ====================================================================
const MEGA_FOLDER_URL = 'https://mega.nz/folder/zJUywQRB#dNH9hxV4fXOXLoQY4Ov3LA';

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// ── In-memory index ───────────────────────────────────────────────────
let zipStructure = {};   // { "District": ["Tehsil1", ...], ... }
let megaFileMap  = {};   // { "District/Tehsil": File object, ... }
let indexReady   = false;
let indexError   = null;

// ── Recursive file finder ─────────────────────────────────────────────
// Walks the MEGA folder tree and finds all PDFs.
// District = immediate parent folder of a PDF file.
function walkMegaTree(node, result) {
  if (!node.children || node.children.length === 0) return;

  // Does this node contain PDF files directly? → it's a district folder
  const pdfsHere = node.children.filter(
    c => !c.directory && c.name && c.name.toLowerCase().endsWith('.pdf')
  );

  if (pdfsHere.length > 0) {
    // node.name is the district name
    const distName = node.name || '__root__';
    if (!result[distName]) result[distName] = {};
    for (const pdf of pdfsHere) {
      const tehsilName = pdf.name.replace(/\.pdf$/i, '');
      result[distName][tehsilName] = pdf;
    }
  }

  // Recurse into sub-directories regardless
  for (const child of node.children) {
    if (child.directory) {
      walkMegaTree(child, result);
    }
  }
}

// ── Build index from MEGA folder ─────────────────────────────────────
function buildMegaIndex() {
  return new Promise((resolve) => {
    console.log('[INFO] Connecting to MEGA folder...');
    console.log('[INFO]', MEGA_FOLDER_URL);

    let folder;
    try {
      folder = File.fromURL(MEGA_FOLDER_URL);
    } catch (e) {
      indexError = 'Invalid MEGA URL: ' + e.message;
      console.error('[ERR]', indexError);
      resolve();
      return;
    }

    folder.loadAttributes((err) => {
      if (err) {
        indexError = 'MEGA connect error: ' + err.message;
        console.error('[ERR]', indexError);
        resolve();
        return;
      }

      // Walk the tree
      const rawMap = {}; // { "District": { "Tehsil": FileObj } }
      walkMegaTree(folder, rawMap);

      // Sort districts and tehsils alphabetically
      Object.keys(rawMap).sort().forEach(dist => {
        zipStructure[dist] = Object.keys(rawMap[dist]).sort();
        Object.keys(rawMap[dist]).forEach(teh => {
          megaFileMap[dist + '/' + teh] = rawMap[dist][teh];
        });
      });

      indexReady = true;
      const totalT = Object.values(zipStructure).reduce((a, b) => a + b.length, 0);
      console.log(`[OK] MEGA indexed: ${Object.keys(zipStructure).length} districts, ${totalT} tehsils`);
      Object.keys(zipStructure).forEach(d => {
        console.log(`   📁 ${d}: ${zipStructure[d].length} tehsils`);
      });
      resolve();
    });
  });
}

// ── API: Status ───────────────────────────────────────────────────────
app.get('/api/status', (req, res) => {
  res.json({
    ready:        indexReady,
    error:        indexError,
    districts:    Object.keys(zipStructure).length,
    totalTehsils: Object.values(zipStructure).reduce((a, b) => a + b.length, 0),
    megaUrl:      MEGA_FOLDER_URL
  });
});

// ── API: Districts ────────────────────────────────────────────────────
app.get('/api/districts', (req, res) => {
  if (!indexReady) {
    return res.status(503).json({ error: 'Index not ready yet, please wait...' });
  }
  res.json({ districts: Object.keys(zipStructure) });
});

// ── API: Tehsils ──────────────────────────────────────────────────────
app.get('/api/tehsils/:district', (req, res) => {
  const district = decodeURIComponent(req.params.district);
  const tehsils  = zipStructure[district];
  if (!tehsils) return res.status(404).json({ error: 'District not found: ' + district });
  res.json({ tehsils });
});

// ── API: Stream PDF from MEGA ─────────────────────────────────────────
// Downloads ONLY the requested file from MEGA — never the full folder.
app.get('/api/pdf/:district/:tehsil', (req, res) => {
  const district = decodeURIComponent(req.params.district);
  const tehsil   = decodeURIComponent(req.params.tehsil);
  const key      = district + '/' + tehsil;
  const file     = megaFileMap[key];

  if (!file) {
    return res.status(404).json({ error: 'PDF not found: ' + key });
  }

  console.log('[PDF] Streaming:', key, file.size ? `(${(file.size/1024/1024).toFixed(1)} MB)` : '');

  // Set headers — inline so browser never prompts to download
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="' + encodeURIComponent(tehsil) + '.pdf"');
  res.setHeader('Cache-Control', 'private, max-age=300'); // 5min browser cache
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (file.size) res.setHeader('Content-Length', file.size);

  // Stream the file from MEGA
  const download = file.download({});

  download.on('error', (e) => {
    console.error('[ERR] MEGA stream:', e.message);
    if (!res.headersSent) res.status(500).json({ error: 'MEGA stream error: ' + e.message });
  });

  req.on('close', () => {
    // Client disconnected — destroy stream to save bandwidth
    if (download.destroy) download.destroy();
  });

  download.pipe(res);
});

// ── Start ─────────────────────────────────────────────────────────────
buildMegaIndex().then(() => {
  app.listen(PORT, () => {
    console.log('\n========================================');
    console.log('  CG Bhu-Sampatti Guideline Portal');
    console.log('  http://localhost:' + PORT);
    if (indexError) {
      console.log('  [!] MEGA Error:', indexError);
    } else {
      console.log('  Districts ready:', Object.keys(zipStructure).length);
    }
    console.log('========================================\n');
  });
});
