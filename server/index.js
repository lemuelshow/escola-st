import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import './db.js';
import { login, logout, auth, gestor } from './auth.js';
import cadastros from './routes/cadastros.js';
import diario from './routes/diario.js';
import documentos from './routes/documentos.js';
import catraca, { iniciarColetaAutomatica } from './routes/catraca.js';

const app = express();
app.use(express.json({ limit: '5mb' }));

app.post('/api/auth/login', login);
app.post('/api/auth/logout', logout);
app.use('/api', auth);
app.use('/api/diario', diario);
app.use('/api/documentos', documentos);
app.use('/api/catraca', gestor, catraca);
app.use('/api', cadastros);
app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada' }));

const dist = path.resolve('dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Gestão Escolar rodando em http://localhost:${PORT}`);
  iniciarColetaAutomatica();
});
