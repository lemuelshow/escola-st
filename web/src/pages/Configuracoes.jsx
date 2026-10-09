import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useUser } from '../App.jsx';
import { Campo, Estado, useApi, useForm, useToast } from '../components/ui.jsx';

export default function Configuracoes() {
  const user = useUser();
  return (
    <>
      <div className="topo"><div><h1>Configurações</h1></div></div>
      {user.papel === 'gestor' && <ConfigEscola />}
      <TrocarSenha />
    </>
  );
}

function ConfigEscola() {
  const { data, carregando, erro } = useApi('/config');
  const [v, setV, bind] = useForm({});
  const toast = useToast();
  useEffect(() => { if (data) setV(data); }, [data, setV]);
  const salvar = async (e) => {
    e.preventDefault();
    try { await api.put('/config', v); toast('Configurações salvas'); } catch (e) { toast(e.message, 'erro'); }
  };
  return (
    <Estado carregando={carregando} erro={erro}>
      <form onSubmit={salvar}>
        <div className="cartao">
          <h2>Dados da escola (aparecem nos documentos)</h2>
          <div className="form-grade">
            <Campo label="Nome da escola" span={2}><input {...bind('escola_nome')} /></Campo>
            <Campo label="CNPJ"><input {...bind('escola_cnpj')} /></Campo>
            <Campo label="Código INEP"><input {...bind('escola_inep')} /></Campo>
            <Campo label="Endereço" span={2}><input {...bind('escola_endereco')} /></Campo>
            <Campo label="Cidade"><input {...bind('escola_cidade')} /></Campo>
            <Campo label="UF"><input {...bind('escola_uf')} maxLength={2} /></Campo>
            <Campo label="Telefone"><input {...bind('escola_telefone')} /></Campo>
            <Campo label="Ato de autorização / criação" span={2}><input {...bind('escola_ato')} /></Campo>
            <Campo label="Diretor(a)"><input {...bind('diretor_nome')} /></Campo>
            <Campo label="Secretário(a) escolar"><input {...bind('secretario_nome')} /></Campo>
          </div>
        </div>
        <div className="cartao">
          <h2>Regras de avaliação</h2>
          <div className="form-grade">
            <Campo label="Ano letivo atual"><input type="number" {...bind('ano_letivo')} /></Campo>
            <Campo label="Bimestre atual (padrão da chamada)">
              <select {...bind('bimestre_atual')}>{[1, 2, 3, 4].map((b) => <option key={b} value={b}>{b}º</option>)}</select>
            </Campo>
            <Campo label="Média para aprovação"><input type="number" step="0.1" {...bind('media_aprovacao')} /></Campo>
            <Campo label="Frequência mínima (%)"><input type="number" {...bind('frequencia_minima')} /></Campo>
          </div>
          <p><small>Média anual = média aritmética dos 4 bimestres (em cada bimestre vale a maior entre nota e recuperação). Abaixo da média, a recuperação final substitui a média anual se for maior.</small></p>
        </div>
        <div className="cartao">
          <h2>Catraca</h2>
          <div className="form-grade">
            <Campo label="Coleta automática de registros">
              <select {...bind('catraca_coleta_auto')}><option value="1">Ligada</option><option value="0">Desligada</option></select>
            </Campo>
            <Campo label="Intervalo de coleta (segundos)"><input type="number" min="10" {...bind('catraca_intervalo')} /></Campo>
            <Campo label="Nº do portal que é ENTRADA"><input type="number" {...bind('catraca_portal_entrada')} /></Campo>
            <Campo label="Hora dos registros">
              <select {...bind('catraca_hora')}><option value="local">Hora local do equipamento (padrão)</option><option value="utc">UTC (converter)</option></select>
            </Campo>
          </div>
          <p><small>O portal só é usado para equipamentos com sentido “pelo portal”. Se os horários aparecerem deslocados em 3h, troque a opção de hora.</small></p>
        </div>
        <button className="btn">Salvar configurações</button>
      </form>
    </Estado>
  );
}

function TrocarSenha() {
  const [s, setS] = useState({ atual: '', nova: '', conf: '' });
  const toast = useToast();
  const salvar = async (e) => {
    e.preventDefault();
    if (s.nova !== s.conf) return toast('A confirmação não confere', 'erro');
    try { await api.post('/auth/senha', s); toast('Senha alterada'); setS({ atual: '', nova: '', conf: '' }); } catch (e) { toast(e.message, 'erro'); }
  };
  const b = (k) => ({ value: s[k], onChange: (e) => setS({ ...s, [k]: e.target.value }), type: 'password', required: true });
  return (
    <form className="cartao" onSubmit={salvar} style={{ marginTop: 16 }}>
      <h2>Alterar minha senha</h2>
      <div className="form-grade">
        <Campo label="Senha atual"><input {...b('atual')} /></Campo>
        <Campo label="Nova senha"><input {...b('nova')} minLength={6} /></Campo>
        <Campo label="Confirmar nova senha"><input {...b('conf')} minLength={6} /></Campo>
      </div>
      <div className="modal-rodape" style={{ justifyContent: 'flex-start' }}><button className="btn">Alterar senha</button></div>
    </form>
  );
}
