// CG Guideline Portal - app.js
// Fetches district/tehsil list and individual PDFs from MEGA via server API

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ── DOM refs ─────────────────────────────────────────────────────────
const districtSelect   = document.getElementById('districtSelect');
const tehsilSelect     = document.getElementById('tehsilSelect');
const viewPdfBtn       = document.getElementById('viewPdfBtn');
const pdfSection       = document.getElementById('pdf-section');
const canvas           = document.getElementById('pdf-canvas');
const ctx              = canvas.getContext('2d');
const prevBtn          = document.getElementById('prevBtn');
const nextBtn          = document.getElementById('nextBtn');
const pageInput        = document.getElementById('pageInput');
const totalPagesEl     = document.getElementById('totalPages');
const pdfTitleText     = document.getElementById('pdfTitleText');
const savePageBtn      = document.getElementById('savePageBtn');
const zoomInBtn        = document.getElementById('zoomInBtn');
const zoomOutBtn       = document.getElementById('zoomOutBtn');
const zoomBadge        = document.getElementById('zoomBadge');
const loadingOverlay   = document.getElementById('loadingOverlay');
const loadingText      = document.getElementById('loadingText');
const menuBtn          = document.getElementById('menuBtn');
const sidebar          = document.getElementById('sidebar');
const sideOverlay      = document.getElementById('overlay');
const errorBanner      = document.getElementById('errorBanner');
const errorMsg         = document.getElementById('errorMsg');
const connectingBanner = document.getElementById('connectingBanner');

// ── State ─────────────────────────────────────────────────────────────
let pdfDoc = null, currentPage = 1, totalPages = 0;
let scale  = 1.5,  renderTask  = null;
let currentDistrict = '', currentTehsil = '';

// ── Sidebar ───────────────────────────────────────────────────────────
menuBtn.addEventListener('click', () => {
  sidebar.classList.toggle('open');
  sideOverlay.classList.toggle('show');
});
sideOverlay.addEventListener('click', closeSidebar);
function closeSidebar() {
  sidebar.classList.remove('open');
  sideOverlay.classList.remove('show');
}

// ── Init: Wait for MEGA index, then load districts ────────────────────
async function init() {
  connectingBanner.style.display = 'flex';
  errorBanner.style.display = 'none';

  let retries = 0;
  const maxRetries = 30; // wait up to ~60 seconds

  async function tryLoadDistricts() {
    try {
      const status = await fetch('/api/status').then(r => r.json());

      if (status.error) {
        connectingBanner.style.display = 'none';
        errorBanner.style.display = 'block';
        errorMsg.textContent = status.error;
        return;
      }

      if (!status.ready || status.districts === 0) {
        // Still connecting to MEGA
        retries++;
        if (retries >= maxRetries) {
          connectingBanner.style.display = 'none';
          errorBanner.style.display = 'block';
          errorMsg.textContent = 'Timeout: MEGA folder index nahi bana. Server check karen.';
          return;
        }
        setTimeout(tryLoadDistricts, 2000); // retry every 2s
        return;
      }

      // Index ready — load districts
      connectingBanner.style.display = 'none';
      const data = await fetch('/api/districts').then(r => r.json());
      districtSelect.innerHTML = '<option value="">— जिला चुनें —</option>';
      data.districts.forEach(d => {
        const o = document.createElement('option');
        o.value = d; o.textContent = d;
        districtSelect.appendChild(o);
      });

    } catch (e) {
      retries++;
      if (retries >= maxRetries) {
        connectingBanner.style.display = 'none';
        errorBanner.style.display = 'block';
        errorMsg.textContent = 'Server connect nahi hua: ' + e.message;
        return;
      }
      setTimeout(tryLoadDistricts, 2000);
    }
  }

  tryLoadDistricts();
}

// ── District change ───────────────────────────────────────────────────
districtSelect.addEventListener('change', async () => {
  const dist = districtSelect.value;
  tehsilSelect.disabled = true;
  tehsilSelect.innerHTML = '<option value="">लोड हो रही है...</option>';
  viewPdfBtn.disabled = true;
  hidePdfSection();

  if (!dist) {
    tehsilSelect.innerHTML = '<option value="">— पहले जिला चुनें —</option>';
    return;
  }

  try {
    const data = await fetch('/api/tehsils/' + encodeURIComponent(dist)).then(r => r.json());
    tehsilSelect.innerHTML = '<option value="">— तहसील चुनें —</option>';
    data.tehsils.forEach(t => {
      const o = document.createElement('option');
      o.value = t; o.textContent = t;
      tehsilSelect.appendChild(o);
    });
    tehsilSelect.disabled = false;
  } catch (e) {
    tehsilSelect.innerHTML = '<option value="">त्रुटि</option>';
    console.error('Tehsil load error:', e);
  }
});

// ── Tehsil change ─────────────────────────────────────────────────────
tehsilSelect.addEventListener('change', () => {
  viewPdfBtn.disabled = !tehsilSelect.value;
});

// ── View PDF ──────────────────────────────────────────────────────────
viewPdfBtn.addEventListener('click', async () => {
  const dist = districtSelect.value;
  const teh  = tehsilSelect.value;
  if (!dist || !teh) return;

  currentDistrict = dist;
  currentTehsil   = teh;

  showLoading(dist + ' / ' + teh + ' लोड हो रही है...');

  try {
    const url = '/api/pdf/' + encodeURIComponent(dist) + '/' + encodeURIComponent(teh);

    // PDF.js streams from our server which proxies MEGA
    pdfDoc = await pdfjsLib.getDocument({
      url: url,
      withCredentials: false,
      disableStream: false,
      disableAutoFetch: false
    }).promise;

    totalPages = pdfDoc.numPages;
    currentPage = 1;
    scale = 1.5;

    totalPagesEl.textContent = totalPages;
    pageInput.max   = totalPages;
    pageInput.value = 1;
    pdfTitleText.textContent = dist + '  े  ' + teh;

    await renderPage(1);

    pdfSection.classList.add('visible');
    prevBtn.disabled = true;
    nextBtn.disabled = totalPages <= 1;
    hideLoading();

    setTimeout(() => {
      pdfSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 200);

  } catch (e) {
    hideLoading();
    console.error('PDF load error:', e);
    alert('पीडीएफ लोड नहीं हुई: ' + e.message +
      '\n\nServer और internet connection जाँचें।');
  }
});

// ── Render page ───────────────────────────────────────────────────────
async function renderPage(num) {
  if (!pdfDoc) return;
  if (renderTask) { renderTask.cancel(); renderTask = null; }

  const page = await pdfDoc.getPage(num);
  const dpr  = window.devicePixelRatio || 1;
  const vp   = page.getViewport({ scale: scale * dpr });

  canvas.width  = vp.width;
  canvas.height = vp.height;
  canvas.style.width  = (vp.width  / dpr) + 'px';
  canvas.style.height = (vp.height / dpr) + 'px';

  renderTask = page.render({ canvasContext: ctx, viewport: vp });
  try {
    await renderTask.promise;
  } catch (e) {
    if (e.name !== 'RenderingCancelledException') throw e;
  }

  pageInput.value  = num;
  prevBtn.disabled = (num <= 1);
  nextBtn.disabled = (num >= totalPages);
  zoomBadge.textContent = Math.round(scale * 100) + '%';
}

// ── Page controls ─────────────────────────────────────────────────────
prevBtn.addEventListener('click', () => {
  if (currentPage > 1) { currentPage--; renderPage(currentPage); }
});
nextBtn.addEventListener('click', () => {
  if (currentPage < totalPages) { currentPage++; renderPage(currentPage); }
});
pageInput.addEventListener('change', () => {
  let p = parseInt(pageInput.value);
  if (isNaN(p) || p < 1) p = 1;
  if (p > totalPages) p = totalPages;
  currentPage = p; renderPage(p);
});
pageInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') pageInput.dispatchEvent(new Event('change'));
});

// ── Zoom ──────────────────────────────────────────────────────────────
zoomInBtn.addEventListener('click', () => {
  if (scale < 3.5) { scale = parseFloat((scale + 0.25).toFixed(2)); renderPage(currentPage); }
});
zoomOutBtn.addEventListener('click', () => {
  if (scale > 0.5) { scale = parseFloat((scale - 0.25).toFixed(2)); renderPage(currentPage); }
});

// ── Save page as PNG image ────────────────────────────────────────────
savePageBtn.addEventListener('click', () => {
  if (!pdfDoc) return;
  const a = document.createElement('a');
  a.download = currentDistrict + '_' + currentTehsil + '_page' + currentPage + '.png';
  a.href     = canvas.toDataURL('image/png');
  a.click();
});

// ── Helpers ───────────────────────────────────────────────────────────
function showLoading(msg) {
  loadingText.textContent = msg || 'Loading...';
  loadingOverlay.classList.add('show');
}
function hideLoading() {
  loadingOverlay.classList.remove('show');
}
function hidePdfSection() {
  pdfSection.classList.remove('visible');
  pdfDoc = null;
}

// Prevent right-click on canvas
canvas.addEventListener('contextmenu', e => e.preventDefault());

// Keyboard navigation
document.addEventListener('keydown', e => {
  if (!pdfDoc) return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    if (currentPage < totalPages) { currentPage++; renderPage(currentPage); }
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    if (currentPage > 1) { currentPage--; renderPage(currentPage); }
  }
});

// ── Start ─────────────────────────────────────────────────────────────
init();
