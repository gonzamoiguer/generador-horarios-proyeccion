/**
 * Ruta del archivo relativa a la carpeta cargada.
 * "/Ciclo/sub/peli.mp4" o "Ciclo/sub/peli.mp4" -> "sub/peli.mp4"; "peli.mp4" -> "peli.mp4".
 */
export function pathInFolder(relPath) {
  const parts = String(relPath).split('/').filter(Boolean);
  return (parts.length > 1 ? parts.slice(1) : parts).join('/');
}

const oneLine = (text) => String(text ?? '').replace(/[\r\n]+/g, ' ').trim();

/**
 * Playlist M3U8 para VLC con rutas relativas: se guarda en la misma carpeta que los videos.
 * Los separadores se convierten en pausas (vlc://pause:segundos).
 */
export function buildM3u(items) {
  const lines = ['#EXTM3U'];
  for (const it of items) {
    if (it.type === 'video') {
      const path = it.path || it.fileName || it.name;
      lines.push(`#EXTINF:${it.duration ?? -1},${oneLine(it.name) || path}`);
      lines.push(path);
    } else if (it.duration > 0) {
      lines.push(`#EXTINF:${it.duration},${oneLine(it.name) || 'Separador'}`);
      lines.push(`vlc://pause:${it.duration}`);
    }
  }
  return lines.join('\r\n') + '\r\n';
}
