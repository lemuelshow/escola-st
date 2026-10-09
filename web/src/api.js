async function request(method, url, body, raw) {
  const opts = { method, credentials: 'same-origin', headers: {} };
  if (raw) {
    opts.headers['Content-Type'] = 'image/jpeg';
    opts.body = body;
  } else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const r = await fetch('/api' + url, opts);
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && !url.startsWith('/auth/')) {
    window.dispatchEvent(new Event('sessao-expirada'));
  }
  if (!r.ok) throw new Error(data.erro || `Erro ${r.status}`);
  return data;
}

export const api = {
  get: (u) => request('GET', u),
  post: (u, b) => request('POST', u, b ?? {}),
  put: (u, b) => request('PUT', u, b ?? {}),
  del: (u) => request('DELETE', u),
  upload: (u, blob) => request('POST', u, blob, true),
};

export const qs = (o) =>
  '?' + new URLSearchParams(Object.entries(o).filter(([, v]) => v !== '' && v != null)).toString();

export const fmtData = (d) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '');
export const fmtNota = (n) => (n == null || n === '' ? '' : Number(n).toFixed(1).replace('.', ','));
export const hoje = () => new Date().toLocaleDateString('sv-SE');

export const dataExtenso = (d = new Date()) =>
  d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

/** Redimensiona para no máx. 640px e devolve JPEG (o equipamento aceita até 1 MB). */
export async function prepararFoto(fonte) {
  const img = fonte instanceof HTMLVideoElement ? fonte : await new Promise((ok, err) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = err;
    i.src = URL.createObjectURL(fonte);
  });
  const w = img.videoWidth || img.naturalWidth, h = img.videoHeight || img.naturalHeight;
  const esc = Math.min(1, 640 / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * esc);
  c.height = Math.round(h * esc);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.85));
}
