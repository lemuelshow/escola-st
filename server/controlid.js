/**
 * Cliente da API REST dos equipamentos Control iD (iDFace, iDBlock, iDAccess...).
 * Docs: https://www.controlid.com.br/docs/access-api-pt/
 *
 * O id do usuário no equipamento é o mesmo id do aluno no sistema.
 * Bloqueio: o aluno é removido do grupo de acesso (user_groups) – o cadastro e a face
 * permanecem no equipamento, mas ele deixa de ter regra de acesso e é negado.
 * (Não usamos end_time porque, ao expirar, o equipamento apaga as credenciais.)
 */
const sessoes = new Map();

export const EVENTOS = {
  1: 'Equipamento inválido', 2: 'Parâmetros de identificação inválidos', 3: 'Não identificado',
  4: 'Identificação pendente', 5: 'Tempo de identificação esgotado', 6: 'Acesso negado',
  7: 'Acesso concedido', 8: 'Acesso pendente', 9: 'Usuário não é administrador',
  10: 'Acesso não identificado', 11: 'Acesso por botoeira', 12: 'Acesso pela interface web',
  13: 'Desistência de entrada', 14: 'Sem resposta', 15: 'Acesso pela interfonia',
};

export class ControlId {
  constructor(disp) {
    this.d = disp;
    this.base = `http://${disp.ip}:${disp.porta || 80}`;
    this.grupo = 1; // grupo "Padrão" que vem configurado de fábrica com a regra de acesso liberado
  }

  get chave() { return `${this.d.id}|${this.d.ip}|${this.d.porta}|${this.d.usuario}`; }

  async login() {
    const r = await this.req('/login.fcgi', { login: this.d.usuario, password: this.d.senha }, { semSessao: true });
    if (!r.session) throw new Error('Login no equipamento falhou');
    sessoes.set(this.chave, r.session);
    return r.session;
  }

  async req(path, body, { raw = false, semSessao = false, tentativa = 0 } = {}) {
    let url = this.base + path;
    if (!semSessao) {
      const s = sessoes.get(this.chave) || (await this.login());
      url += (path.includes('?') ? '&' : '?') + 'session=' + encodeURIComponent(s);
    }
    let resp;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': raw ? 'application/octet-stream' : 'application/json' },
        body: raw ? body : JSON.stringify(body ?? {}),
        signal: AbortSignal.timeout(10000),
      });
    } catch (e) {
      throw new Error(`Sem comunicação com ${this.d.nome} (${this.d.ip}): ${e.cause?.code || e.message}`);
    }
    const txt = await resp.text();
    let data = {};
    try { data = txt ? JSON.parse(txt) : {}; } catch { data = { texto: txt }; }
    if (resp.status === 401 && !semSessao && tentativa === 0) {
      sessoes.delete(this.chave);
      return this.req(path, body, { raw, tentativa: 1 });
    }
    if (!resp.ok) throw new Error(data.error || data.texto || `HTTP ${resp.status}`);
    return data;
  }

  info() { return this.req('/system_information.fcgi', {}); }

  async existe(id) {
    const r = await this.req('/load_objects.fcgi', { object: 'users', where: { users: { id } } });
    return (r.users || []).length > 0;
  }

  /** Cria ou atualiza o aluno no equipamento e aplica bloqueio/liberação. */
  async salvarUsuario({ id, nome, matricula, bloqueado }) {
    const valores = { name: nome, registration: String(matricula || id) };
    if (await this.existe(id)) {
      await this.req('/modify_objects.fcgi', { object: 'users', values: valores, where: { users: { id } } });
    } else {
      await this.req('/create_objects.fcgi', { object: 'users', values: [{ id, ...valores }] });
    }
    await this.definirBloqueio(id, bloqueado);
  }

  async definirBloqueio(id, bloqueado) {
    await this.req('/destroy_objects.fcgi', { object: 'user_groups', where: { user_groups: { user_id: id } } });
    if (!bloqueado) {
      await this.req('/create_objects.fcgi', { object: 'user_groups', values: [{ user_id: id, group_id: this.grupo }] });
    }
  }

  /** Foto JPEG (até 1 MB). match=1 faz o equipamento recusar se a face já pertence a outro usuário. */
  async enviarFoto(id, jpeg) {
    const ts = Math.floor(Date.now() / 1000);
    const r = await this.req(`/user_set_image.fcgi?user_id=${id}&match=1&timestamp=${ts}`, jpeg, { raw: true });
    if (r && r.success === false) {
      const erros = (r.errors || []).map((e) => e.message || e.code).join('; ');
      throw new Error(`Foto recusada pelo equipamento${erros ? ': ' + erros : ''}`);
    }
    return r;
  }

  async removerUsuario(id) {
    await this.req('/destroy_objects.fcgi', { object: 'users', where: { users: { id } } });
  }

  async logsDesde(ultimoId, limite = 500) {
    const r = await this.req('/load_objects.fcgi', {
      object: 'access_logs',
      where: { access_logs: { id: { '>': ultimoId } } },
      order: ['id'],
      limit: limite,
    });
    return r.access_logs || [];
  }
}
