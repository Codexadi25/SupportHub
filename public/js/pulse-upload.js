/* upload.js — CSV / Excel parsing and bulk upload */

let _selectedDataType = 'full';
let _parsedSheets = {};
let _selectedSheets = new Set();
let _rawFile = null;

function selectDataType(el, type) {
    document.querySelectorAll('.data-type-option').forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');
    _selectedDataType = type;
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    _rawFile = file;
    document.getElementById('uploadBtn').disabled = true;

    const ext = file.name.split('.').pop().toLowerCase();
    const reader = new FileReader();

    reader.onload = (e) => {
        if (ext === 'csv') {
            parseCSV(e.target.result, file.name);
        } else {
            parseExcel(e.target.result, file.name);
        }
    };

    if (ext === 'csv') {
        reader.readAsText(file);
    } else {
        reader.readAsArrayBuffer(file);
    }
}

function parseCSV(text, filename) {
    const wb = XLSX.read(text, { type: 'string' });
    handleWorkbook(wb, filename);
}

function parseExcel(buffer, filename) {
    const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });
    handleWorkbook(wb, filename);
}

function handleWorkbook(wb, filename) {
    _parsedSheets = {};
    _selectedSheets.clear();

    wb.SheetNames.forEach(name => {
        const ws   = wb.Sheets[name];
        const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (data.length > 0) {
            _parsedSheets[name] = data;
            _selectedSheets.add(name);
        }
    });

    const sheetCount = Object.keys(_parsedSheets).length;
    if (sheetCount === 0) {
        toast('No data found in file', 'error');
        return;
    }

    // Render sheet tabs
    const tabsEl = document.getElementById('sheetTabsList');
    tabsEl.innerHTML = Object.keys(_parsedSheets).map(name => `
        <div class="sheet-tab active" data-sheet="${name}" onclick="toggleSheet(this, '${name}')">
            📄 ${name} <span style="opacity:0.7;font-size:10px;">(${_parsedSheets[name].length} rows)</span>
        </div>`).join('');
    document.getElementById('sheetSelector').style.display = 'block';

    // Preview first selected sheet
    previewSheet(Object.keys(_parsedSheets)[0]);

    document.getElementById('uploadBtn').disabled = false;
    toast(`Loaded: ${filename} — ${sheetCount} sheet(s)`, 'success');
}

function toggleSheet(el, name) {
    if (_selectedSheets.has(name)) {
        _selectedSheets.delete(name);
        el.classList.remove('active');
    } else {
        _selectedSheets.add(name);
        el.classList.add('active');
    }
    document.getElementById('uploadBtn').disabled = _selectedSheets.size === 0;
}

function previewSheet(sheetName) {
    const data = _parsedSheets[sheetName];
    if (!data || !data.length) return;

    const headers = Object.keys(data[0]);
    const rows    = data.slice(0, 5);

    const table = document.getElementById('previewTable');
    table.innerHTML = `
        <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(row => `<tr>${headers.map(h => `<td>${row[h] ?? ''}</td>`).join('')}</tr>`).join('')}</tbody>
    `;
    document.getElementById('previewWrap').style.display = 'block';
}

async function startUpload() {
    if (_selectedSheets.size === 0) { toast('No sheets selected', 'warning'); return; }

    const uploadBtn = document.getElementById('uploadBtn');
    uploadBtn.disabled = true;
    uploadBtn.textContent = '⏳ Uploading…';

    document.getElementById('uploadStep1').style.display = 'none';
    document.getElementById('uploadResults').style.display = 'block';

    const progressList = document.getElementById('uploadProgressList');
    const summary = document.getElementById('uploadSummary');

    let totalSuccess = 0, totalFail = 0;

    for (const sheetName of _selectedSheets) {
        const rows = _parsedSheets[sheetName];
        const item = document.createElement('div');
        item.className = 'upload-progress-item';
        item.innerHTML = `
            <span class="file-name">📄 ${sheetName}</span>
            <span class="upload-status proc">⏳ Processing ${rows.length} rows…</span>`;
        progressList.appendChild(item);

        try {
            const res = await fetch('/performance/api/performance/bulk-upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dataType: _selectedDataType,
                    sheetName,
                    rows,
                    org: window.APP.org
                })
            });
            const result = await res.json();

            totalSuccess += result.successRows || 0;
            totalFail    += result.failedRows  || 0;

            item.querySelector('.upload-status').className = 'upload-status ok';
            item.querySelector('.upload-status').textContent = `✅ ${result.successRows} ok · ${result.failedRows} failed`;

        } catch (err) {
            totalFail += rows.length;
            item.querySelector('.upload-status').className = 'upload-status fail';
            item.querySelector('.upload-status').textContent = '❌ Error';
        }
    }

    summary.innerHTML = `
        <div style="display:flex;gap:24px;">
            <div><span style="color:var(--clr-green);font-weight:700;font-family:var(--font-mono);">${totalSuccess}</span> <span style="color:var(--clr-text-muted);">rows uploaded</span></div>
            <div><span style="color:var(--clr-red);font-weight:700;font-family:var(--font-mono);">${totalFail}</span> <span style="color:var(--clr-text-muted);">rows failed</span></div>
        </div>
        <p style="margin-top:8px;color:var(--clr-text-muted);">Dashboard will refresh with new data.</p>`;

    uploadBtn.textContent = '✅ Done';
    setTimeout(() => {
        closeModal('uploadModal');
        resetUploadModal();
        refreshDashboard();
        toast(`Upload complete — ${totalSuccess} rows imported`, 'success');
    }, 2000);
}

function resetUploadModal() {
    _parsedSheets = {};
    _selectedSheets.clear();
    _rawFile = null;
    document.getElementById('uploadStep1').style.display = 'block';
    document.getElementById('uploadResults').style.display = 'none';
    document.getElementById('previewWrap').style.display = 'none';
    document.getElementById('sheetSelector').style.display = 'none';
    document.getElementById('uploadBtn').disabled = true;
    document.getElementById('uploadBtn').textContent = '⬆ Upload Data';
    document.getElementById('uploadProgressList').innerHTML = '';
    document.getElementById('previewTable').innerHTML = '';
    document.getElementById('fileInput').value = '';
}

// ── Drag and Drop ─────────────────────────────────────────
const zone = document.getElementById('uploadZone');
if (zone) {
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) {
            const dt = new DataTransfer();
            dt.items.add(file);
            document.getElementById('fileInput').files = dt.files;
            handleFileSelect({ target: { files: [file] } });
        }
    });
}
