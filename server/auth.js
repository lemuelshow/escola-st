import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db, segredo } from './db.js';

let SECRET = process.env.JWT_SECRET || null;
const chave = async () => (SECRET ||= await segredo('jwt_secret'));

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export async function login(req, res) {
  try {
    const { email, senha } = req.body || {};
    const u = await db.get('SELECT * FROM usuarios WHERE email = ? AND ativo = 1', String(email || '').trim().toLowerCase());
    if (!u || !bcrypt.compareSync(String(senha || ''), u.senha_hash)) {
      return res.status(401).json({ erro: 'E-mail ou senha inválidos' });
    }
    const token = jwt.sign({ id: u.id }, await chave(), { expiresIn: '12h' });
    const seguro = req.secure || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `token=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${12 * 3600}${seguro}`);
    res.json({ id: u.id, nome: u.nome, email: u.email, papel: u.papel });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao entrar. Tente novamente.' });
  }
}

export function logout(req, res) {
  res.setHeader('Set-Cookie', 'token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  res.json({ ok: true });
}

export async function auth(req, res, next) {
  let id;
  try {
    ({ id } = jwt.verify(parseCookies(req.headers.cookie).token, await chave()));
  } catch {
    return res.status(401).json({ erro: 'Não autenticado' });
  }
  try {
    const u = await db.get('SELECT id, nome, email, papel FROM usuarios WHERE id = ? AND ativo = 1', id);
    if (!u) return res.status(401).json({ erro: 'Não autenticado' });
    req.user = u;
    next();
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro de conexão com o banco' });
  }
}

export function gestor(req, res, next) {
  if (req.user?.papel !== 'gestor') return res.status(403).json({ erro: 'Acesso restrito ao gestor' });
  next();
}

/** Gestor acessa tudo; professor só turma/disciplina atribuída a ele. */
export async function podeAcessar(user, turmaId, disciplinaId) {
  if (user.papel === 'gestor') return true;
  if (disciplinaId == null) {
    return !!(await db.get('SELECT 1 FROM turma_disciplinas WHERE turma_id = ? AND professor_id = ?', turmaId, user.id));
  }
  return !!(await db.get('SELECT 1 FROM turma_disciplinas WHERE turma_id = ? AND disciplina_id = ? AND professor_id = ?',
    turmaId, disciplinaId, user.id));
}

export function hashSenha(s) {
  return bcrypt.hashSync(s, 10);
}

export function conferirSenha(s, hash) {
  return bcrypt.compareSync(s, hash);
}
