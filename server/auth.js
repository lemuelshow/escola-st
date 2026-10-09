import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db, DATA_DIR } from './db.js';

const secretFile = path.join(DATA_DIR, 'jwt.secret');
const SECRET = process.env.JWT_SECRET || (() => {
  if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, crypto.randomBytes(48).toString('hex'));
  return fs.readFileSync(secretFile, 'utf8');
})();

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function login(req, res) {
  const { email, senha } = req.body || {};
  const u = db.prepare('SELECT * FROM usuarios WHERE email = ? AND ativo = 1').get(String(email || '').trim().toLowerCase());
  if (!u || !bcrypt.compareSync(String(senha || ''), u.senha_hash)) {
    return res.status(401).json({ erro: 'E-mail ou senha inválidos' });
  }
  const token = jwt.sign({ id: u.id }, SECRET, { expiresIn: '12h' });
  res.setHeader('Set-Cookie', `token=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${12 * 3600}`);
  res.json({ id: u.id, nome: u.nome, email: u.email, papel: u.papel });
}

export function logout(req, res) {
  res.setHeader('Set-Cookie', 'token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  res.json({ ok: true });
}

export function auth(req, res, next) {
  try {
    const { token } = parseCookies(req.headers.cookie);
    const { id } = jwt.verify(token, SECRET);
    const u = db.prepare('SELECT id, nome, email, papel FROM usuarios WHERE id = ? AND ativo = 1').get(id);
    if (!u) throw new Error();
    req.user = u;
    next();
  } catch {
    res.status(401).json({ erro: 'Não autenticado' });
  }
}

export function gestor(req, res, next) {
  if (req.user?.papel !== 'gestor') return res.status(403).json({ erro: 'Acesso restrito ao gestor' });
  next();
}

/** Gestor acessa tudo; professor só turma/disciplina atribuída a ele. */
export function podeAcessar(user, turmaId, disciplinaId) {
  if (user.papel === 'gestor') return true;
  if (disciplinaId == null) {
    return !!db.prepare('SELECT 1 FROM turma_disciplinas WHERE turma_id = ? AND professor_id = ?').get(turmaId, user.id);
  }
  return !!db.prepare('SELECT 1 FROM turma_disciplinas WHERE turma_id = ? AND disciplina_id = ? AND professor_id = ?')
    .get(turmaId, disciplinaId, user.id);
}

export function hashSenha(s) {
  return bcrypt.hashSync(s, 10);
}

export function conferirSenha(s, hash) {
  return bcrypt.compareSync(s, hash);
}
