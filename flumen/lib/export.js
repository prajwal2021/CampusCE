'use client';

/**
 * Report exports: PDF (chart image + data table), Excel and CSV. Every file ends with the date and
 * time it was generated (Central time) and when the data was last synced.
 * The heavy libraries load only when someone exports.
 */

const CST = 'America/Chicago';
export const stamp = (d = new Date()) =>
  d.toLocaleString('en-US', { timeZone: CST, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' CST';

const safeName = s => String(s || 'report').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_').slice(0, 80) || 'report';
const fileDate = () => new Date().toLocaleDateString('en-CA', { timeZone: CST });

/** table: { columns: [{ key, label, num?, fmt? }], rows: [...] } -> array of display rows */
function matrix(table) {
  const head = table.columns.map(c => c.label);
  const body = table.rows.map(r => table.columns.map(c => {
    const v = r[c.key];
    if (c.fmt) return c.fmt(v, r);
    return v === null || v === undefined ? '' : v;
  }));
  return { head, body };
}

function footerLines({ filters, dataAsOf }) {
  return [
    filters ? `Filters: ${filters}` : null,
    dataAsOf ? `Data as of: ${stamp(new Date(dataAsOf))}` : null,
    `Generated: ${stamp()}`,
    'Source: Flumen · CampusCE (Canvas extract)',
  ].filter(Boolean);
}

export function downloadCSV({ title, table, filters, dataAsOf }) {
  const { head, body } = matrix(table);
  const esc = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [head, ...body].map(r => r.map(esc).join(','));
  lines.push('', ...footerLines({ filters, dataAsOf }).map(l => esc(l)));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  save(blob, `${safeName(title)}_${fileDate()}.csv`);
}

/** sheets: [{ title, table }]. One worksheet per report, each ending with the generated time. */
export async function downloadExcel({ title, sheets, filters, dataAsOf }) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const used = new Set();
  for (const s of sheets) {
    const { head, body } = matrix(s.table);
    const aoa = [[s.title], filters ? [`Filters: ${filters}`] : [], [], head, ...body, [], ...footerLines({ filters: null, dataAsOf }).map(l => [l])];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = head.map((h, i) => ({ wch: Math.min(60, Math.max(String(h).length, ...body.map(r => String(r[i] ?? '').length)) + 2) }));
    let name = safeName(s.title).replace(/_/g, ' ').slice(0, 28) || 'Sheet';
    while (used.has(name)) name = name.slice(0, 26) + used.size;
    used.add(name);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  XLSX.writeFile(wb, `${safeName(title)}_${fileDate()}.xlsx`);
}

async function snapshot(node) {
  const { toPng } = await import('html-to-image');
  const bg = getComputedStyle(node).backgroundColor;
  return toPng(node, {
    pixelRatio: 2, skipFonts: true, cacheBust: true,
    backgroundColor: bg && bg !== 'rgba(0, 0, 0, 0)' ? bg : '#ffffff',
    filter: el => !(el.dataset && el.dataset.noExport !== undefined),
  });
}

/**
 * reports: [{ title, subtitle?, node? (chart element), table }]. One PDF, a page per report,
 * chart image then the data, and the generated time at the end of the document.
 */
export async function downloadPDF({ title, reports, filters, dataAsOf }) {
  const [{ jsPDF }, autoTableMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const autoTable = autoTableMod.default || autoTableMod.autoTable;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  const NAVY = [15, 30, 56], MUTED = [104, 117, 140], CORAL = [200, 78, 55];

  const header = (t, sub) => {
    doc.setFillColor(...CORAL); doc.rect(0, 0, W, 4, 'F');
    doc.setTextColor(...MUTED); doc.setFontSize(8); doc.text('CampusCE · Flumen', M, 24);
    doc.setTextColor(...NAVY); doc.setFontSize(17); doc.setFont('helvetica', 'bold'); doc.text(t, M, 48);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUTED);
    const lines = doc.splitTextToSize([sub, filters ? `Filters: ${filters}` : null].filter(Boolean).join('   ·   '), W - 2 * M);
    doc.text(lines, M, 64);
    return 64 + lines.length * 11 + 8;
  };

  for (let i = 0; i < reports.length; i++) {
    const r = reports[i];
    if (i > 0) doc.addPage();
    let y = header(r.title, r.subtitle);
    if (r.node) {
      try {
        const img = await snapshot(r.node);
        const props = doc.getImageProperties(img);
        const maxW = W - 2 * M, maxH = H * 0.5;
        let w = maxW, h = (props.height * w) / props.width;
        if (h > maxH) { h = maxH; w = (props.width * h) / props.height; }
        doc.addImage(img, 'PNG', M, y, w, h);
        y += h + 14;
      } catch { /* chart image is optional; the table still prints */ }
    }
    if (r.table && r.table.rows.length) {
      const { head, body } = matrix(r.table);
      autoTable(doc, {
        startY: y, head: [head], body, margin: { left: M, right: M, bottom: 40 },
        styles: { fontSize: 8, cellPadding: 4, textColor: [52, 66, 92], lineColor: [225, 230, 238], lineWidth: 0.5 },
        headStyles: { fillColor: [244, 246, 250], textColor: NAVY, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [250, 251, 253] },
        columnStyles: Object.fromEntries(r.table.columns.map((c, ci) => [ci, c.num ? { halign: 'right' } : {}])),
      });
    }
  }

  // closing block on the last page: when this was generated
  let y = (doc.lastAutoTable?.finalY || H - 90) + 24;
  if (y > H - 70) { doc.addPage(); y = 60; }
  doc.setDrawColor(225, 230, 238); doc.line(M, y, W - M, y);
  doc.setFontSize(9); doc.setTextColor(...MUTED);
  footerLines({ filters: null, dataAsOf }).forEach((l, i) => doc.text(l, M, y + 16 + i * 12));

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p); doc.setFontSize(8); doc.setTextColor(...MUTED);
    doc.text(`Generated ${stamp()}`, M, H - 18);
    doc.text(`Page ${p} of ${pages}`, W - M, H - 18, { align: 'right' });
  }
  doc.save(`${safeName(title)}_${fileDate()}.pdf`);
}

function save(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
