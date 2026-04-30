const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += c;
    } else {
      if (c === ',') { out.push(cur); cur = ''; }
      else if (c === '"') inQ = true;
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

function readCsv(file, headers) {
  ensureDir();
  const fp = path.join(DATA_DIR, file);
  if (!fs.existsSync(fp)) return [];
  const txt = fs.readFileSync(fp, 'utf8').replace(/\r\n/g, '\n');
  if (!txt.trim()) return [];
  const lines = txt.split('\n').filter(Boolean);
  if (lines.length === 0) return [];
  const head = parseCsvLine(lines[0]);
  const cols = headers || head;
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCsvLine(lines[i]);
    const obj = {};
    cols.forEach((h, j) => { obj[h] = vals[j] !== undefined ? vals[j] : ''; });
    rows.push(obj);
  }
  return rows;
}

function writeCsv(file, headers, rows) {
  ensureDir();
  const fp = path.join(DATA_DIR, file);
  const lines = [headers.map(csvEscape).join(',')];
  for (const r of rows) lines.push(headers.map(h => csvEscape(r[h])).join(','));
  fs.writeFileSync(fp, lines.join('\n') + '\n', 'utf8');
}

function appendCsv(file, headers, row) {
  ensureDir();
  const fp = path.join(DATA_DIR, file);
  const exists = fs.existsSync(fp);
  let out = '';
  if (!exists) out += headers.map(csvEscape).join(',') + '\n';
  out += headers.map(h => csvEscape(row[h])).join(',') + '\n';
  fs.appendFileSync(fp, out, 'utf8');
}

module.exports = { readCsv, writeCsv, appendCsv, DATA_DIR };
