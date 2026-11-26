/** Arma un CSV con el separador indicado, escapando lo necesario. */
export function buildCsv(rows, sep) {
  const escape = (value) => {
    let v = String(value ?? '');
    if (sep === '\t') return v.replace(/[\t\r\n]+/g, ' ');
    if (v.includes(sep) || /["\r\n]/.test(v)) v = `"${v.replace(/"/g, '""')}"`;
    return v;
  };
  return rows.map((r) => r.map(escape).join(sep)).join('\r\n');
}
