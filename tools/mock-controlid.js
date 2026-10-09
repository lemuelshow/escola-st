/**
 * Simulador simples de um equipamento Control iD para testes sem hardware.
 *   npm run mock-catraca            -> escuta em http://localhost:8090
 * Cadastre no sistema um equipamento com IP "127.0.0.1" e porta 8090 (usuário/senha admin).
 * A cada 15s gera uma passagem (entrada/saída) de um usuário aleatório cadastrado.
 */
import http from 'node:http';

const PORT = Number(process.env.PORT) || 8090;
const users = new Map();
const userGroups = [];
const fotos = new Map();
const logs = [];
let logId = 0;
const SESSION = 'mock-session-123';

function addLog(user_id, event, portal_id) {
  // hora local "como se fosse UTC", igual aos equipamentos reais
  const d = new Date();
  const time = Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 1000);
  logs.push({ id: ++logId, time, event, device_id: 1, user_id, portal_id });
}

setInterval(() => {
  const ids = [...users.keys()];
  if (!ids.length) return;
  const id = ids[Math.floor(Math.random() * ids.length)];
  const liberado = userGroups.some((g) => g.user_id === id);
  addLog(id, liberado ? 7 : 6, Math.random() < 0.6 ? 1 : 2);
  console.log(`[mock] passagem usuario ${id} ${liberado ? 'liberada' : 'NEGADA'}`);
}, 15000);

const match = (obj, where = {}) => Object.entries(where).every(([k, v]) =>
  typeof v === 'object' ? Object.entries(v).every(([op, x]) => (op === '>' ? obj[k] > x : op === '<' ? obj[k] < x : obj[k] === x)) : obj[k] === v);

http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    const send = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    const raw = Buffer.concat(chunks);
    if (url.pathname === '/login.fcgi') {
      const b = JSON.parse(raw || '{}');
      return b.login === 'admin' && b.password === 'admin' ? send(200, { session: SESSION }) : send(401, { error: 'Invalid login' });
    }
    if (url.searchParams.get('session') !== SESSION) return send(401, { error: 'Session is not valid' });
    const b = req.headers['content-type'] === 'application/json' ? JSON.parse(raw || '{}') : null;
    switch (url.pathname) {
      case '/system_information.fcgi':
        return send(200, { serial: 'MOCK0001', version: 'mock', device_id: 1, uptime: { days: 0, hours: 1 } });
      case '/load_objects.fcgi': {
        let list = b.object === 'users' ? [...users.values()] : b.object === 'access_logs' ? logs : b.object === 'user_groups' ? userGroups : [];
        list = list.filter((o) => match(o, b.where?.[b.object]));
        return send(200, { [b.object]: list.slice(0, b.limit || 1000) });
      }
      case '/create_objects.fcgi':
        for (const v of b.values) {
          if (b.object === 'users') { if (users.has(v.id)) return send(400, { error: 'UNIQUE constraint failed: users.id' }); users.set(v.id, v); }
          if (b.object === 'user_groups') userGroups.push(v);
        }
        return send(200, { ids: b.values.map((v) => v.id || 0) });
      case '/modify_objects.fcgi':
        for (const u of users.values()) if (match(u, b.where.users)) Object.assign(u, b.values);
        return send(200, { changes: 1 });
      case '/destroy_objects.fcgi':
        if (b.object === 'users') for (const [id, u] of users) if (match(u, b.where.users)) { users.delete(id); fotos.delete(id); }
        if (b.object === 'user_groups') for (let i = userGroups.length - 1; i >= 0; i--) if (match(userGroups[i], b.where.user_groups)) userGroups.splice(i, 1);
        return send(200, { changes: 1 });
      case '/user_set_image.fcgi': {
        const id = Number(url.searchParams.get('user_id'));
        if (raw.length > 1024 * 1024) return send(200, { success: false, errors: [{ code: 1, message: 'Imagem maior que 1MB' }] });
        fotos.set(id, raw.length);
        console.log(`[mock] foto recebida usuario ${id} (${raw.length} bytes)`);
        return send(200, { success: true, scores: { bounds_width: 300, horizontal_center_offset: 10, vertical_center_offset: 5, center_pose_quality: 90, sharpness_quality: 90 } });
      }
      default:
        return send(404, { error: 'not found' });
    }
  });
}).listen(PORT, () => console.log(`Simulador Control iD em http://localhost:${PORT} (login admin/admin)`));
