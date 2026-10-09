import { useParams } from 'react-router-dom';
import { fmtData } from '../../api.js';
import { useApi } from '../../components/ui.jsx';
import { TIPOS_DECLARACAO } from '../Documentos.jsx';
import { Assinaturas, CabecalhoEscola, LocalData, PrintShell, nota } from './comum.jsx';

function texto(tipo, { escola: e, aluno: a, boletim: b }) {
  const m = b?.matricula;
  const ao = a.sexo === 'F' ? 'a' : 'o';
  const ident = `${a.nome}, nascid${ao} em ${fmtData(a.data_nascimento) || '___/___/____'}${a.naturalidade ? `, natural de ${a.naturalidade}${a.uf_naturalidade ? '/' + a.uf_naturalidade : ''}` : ''}${a.nome_mae ? `, filh${ao} de ${a.nome_mae}${a.nome_pai ? ` e ${a.nome_pai}` : ''}` : ''}, matrícula nº ${a.matricula}`;
  const turma = m ? `no(a) ${m.serie}, turma ${m.turma_nome}, turno ${String(m.turno || '').toLowerCase()}, no ano letivo de ${m.ano_letivo}` : 'no ano letivo vigente';
  switch (tipo) {
    case 'matricula':
      return `Declaramos, para os devidos fins, que ${ident}, encontra-se regularmente matriculad${ao} nesta unidade de ensino, ${e.escola_nome}, ${turma}.`;
    case 'frequencia':
      return `Declaramos, para os devidos fins, que ${ident}, está regularmente matriculad${ao} e frequentando as aulas nesta unidade de ensino, ${e.escola_nome}, ${turma}, apresentando até a presente data frequência de ${b?.frequencia != null ? nota(b.frequencia) + '%' : '____%'}.`;
    case 'transferencia':
      return `Declaramos, para os devidos fins, que ${ident}, foi alun${ao} desta unidade de ensino, ${e.escola_nome}, ${turma}, tendo solicitado transferência nesta data. O histórico escolar será expedido no prazo de até 30 (trinta) dias.`;
    case 'conclusao':
      return `Declaramos, para os devidos fins, que ${ident}, concluiu ${m ? `o(a) ${m.serie}` : 'a série'} nesta unidade de ensino, ${e.escola_nome}, no ano letivo de ${m?.ano_letivo ?? '____'}, tendo sido considerad${ao} ${String(b?.situacao || 'aprovad' + ao).toUpperCase()}.`;
    default:
      return '';
  }
}

export default function Declaracao() {
  const { tipo, id } = useParams();
  const { data, carregando, erro } = useApi(`/documentos/declaracao/${id}`);
  const titulo = TIPOS_DECLARACAO[tipo] || 'Declaração';
  return (
    <PrintShell titulo={titulo} carregando={carregando} erro={erro} dica="clique no texto para editar antes de imprimir">
      {data && (
        <div className="folha">
          <CabecalhoEscola e={data.escola} />
          <h1 style={{ marginTop: 50 }}>{titulo.replace('Declaração de', 'Declaração de')}</h1>
          <p className="texto-declaracao" contentEditable suppressContentEditableWarning>{texto(tipo, data)}</p>
          <p className="texto-declaracao" contentEditable suppressContentEditableWarning style={{ margin: 0 }}>
            Por ser expressão da verdade, firmamos a presente declaração.
          </p>
          <LocalData e={data.escola} />
          <div style={{ marginTop: 80 }}><Assinaturas e={data.escola} /></div>
        </div>
      )}
    </PrintShell>
  );
}
