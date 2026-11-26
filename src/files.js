const VIDEO_EXT = /\.(mp4|m4v|mov|mkv|webm|avi|wmv|mpg|mpeg|m2ts|mts|ts|mxf|ogv|3gp|flv|vob|dv)$/i;

export function isVideoFile(file) {
  if (file.name.startsWith('.')) return false;
  return (file.type && file.type.startsWith('video/')) || VIDEO_EXT.test(file.name);
}

/** Lee la duración (en segundos) con el decodificador del navegador. null si no puede. */
export function readDuration(file, timeout = 20000) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeout);
    video.preload = 'metadata';
    video.muted = true;
    video.addEventListener('loadedmetadata', () => {
      const d = video.duration;
      finish(Number.isFinite(d) && d > 0 ? d : null);
    });
    video.addEventListener('error', () => finish(null));
    video.src = url;
  });
}

function readAllEntries(reader) {
  return new Promise((resolve) => {
    const all = [];
    const next = () =>
      reader.readEntries(
        (batch) => {
          if (!batch.length) return resolve(all);
          all.push(...batch);
          next();
        },
        () => resolve(all),
      );
    next();
  });
}

async function walk(entry, out) {
  if (entry.isFile) {
    const file = await new Promise((res) => entry.file(res, () => res(null)));
    if (file) {
      file.relPath = entry.fullPath || file.name;
      out.push(file);
    }
  } else if (entry.isDirectory) {
    const entries = await readAllEntries(entry.createReader());
    for (const e of entries) await walk(e, out);
  }
}

/** Obtiene todos los archivos de un drop, recorriendo carpetas si las hay. */
export async function collectFromDataTransfer(dt) {
  const items = Array.from(dt.items || []);
  const entries = items
    .filter((i) => i.kind === 'file')
    .map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null));

  if (entries.length && entries.every(Boolean)) {
    const out = [];
    for (const e of entries) await walk(e, out);
    return out;
  }
  return Array.from(dt.files || []).map((f) => {
    f.relPath = f.name;
    return f;
  });
}
