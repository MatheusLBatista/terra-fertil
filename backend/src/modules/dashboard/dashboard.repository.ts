import { sql, type SQL } from "drizzle-orm";
import { db, type DbOrTx } from "../../db/index.ts";
import type { Escopo } from "../../lib/escopo.ts";

/*
 * Consultas agregadas do dashboard em SQL direto (contagens e listas curtas
 * atravessando vários módulos). Toda coluna vai qualificada pelo alias da
 * tabela: dentro de subquery, um nome solto pegaria a tabela de dentro.
 */

const LIMITE = 5;

/** "ASPROMEP" na associação; "João Silva — Boa Viagem" na propriedade. */
const ONDE = sql`coalesce(
  a.sigla,
  nullif(concat_ws(' — ', pu.name, p.nome), ''),
  '—'
)`;
/** Joins para montar `onde` a partir da visita `v`. */
const JOINS_ONDE = sql`
  left join associacoes a on a.id = v.associacao_id
  left join propriedades p on p.id = v.propriedade_id
  left join produtores pr on pr.id = p.produtor_id
  left join "user" pu on pu.id = pr.user_id`;
const ASSINAVEL = sql`((v.tipo = 'acompanhamento' and v.associacao_id is not null) or v.tipo = 'assistencia_tecnica')`;
const SEM_ASSINATURA = sql`not exists (
  select 1 from assinaturas s where s.visita_id = v.id and s.deleted_at is null
)`;

async function linhas<T>(tx: DbOrTx, query: SQL): Promise<T[]> {
  return (await tx.execute(query)).rows as T[];
}

/** Total + as primeiras `LIMITE` linhas do mesmo filtro. */
async function listaCurta<T>(tx: DbOrTx, select: SQL, from: SQL, ordem: SQL) {
  const [itens, [{ total }]] = await Promise.all([
    linhas<T>(tx, sql`select ${select} ${from} order by ${ordem} limit ${LIMITE}`),
    linhas<{ total: number }>(tx, sql`select cast(count(*) as int) as total ${from}`),
  ]);
  return { total, itens };
}

const resumoVisita = sql`v.id, v.tipo, to_char(v.data, 'YYYY-MM-DD') as data, ${ONDE} as onde,
  pj.sigla as "projetoSigla", tu.name as "tecnicoNome"`;
const JOINS_RESUMO = sql`
  join projetos pj on pj.id = v.projeto_id
  join "user" tu on tu.id = v.tecnico_id
  ${JOINS_ONDE}`;

export default class DashboardRepository {
  async indicadores(projetoId: string, hoje: string, tx: DbOrTx = db) {
    const [row] = await linhas<{
      visitasMes: number;
      visitasMesAnterior: number;
      entregasEntregues: number;
      entregasDemandadas: number;
      associacoesVisitadas: number;
      associacoes: number;
      liberadoCentavos: number;
      gastoCentavos: number;
    }>(
      tx,
      sql`
      with mes as (select date_trunc('month', ${hoje}::date)::date as inicio)
      select
        (select cast(count(*) as int) from visitas v, mes
          where v.projeto_id = ${projetoId} and v.deleted_at is null and v.situacao = 'realizada'
            and v.data >= mes.inicio and v.data <= ${hoje}::date) as "visitasMes",
        (select cast(count(*) as int) from visitas v, mes
          where v.projeto_id = ${projetoId} and v.deleted_at is null and v.situacao = 'realizada'
            and v.data >= (mes.inicio - interval '1 month')::date and v.data < mes.inicio) as "visitasMesAnterior",
        (select cast(count(*) as int) from entregas e
          where e.projeto_id = ${projetoId} and e.deleted_at is null and e.situacao = 'entregue') as "entregasEntregues",
        (select cast(count(*) as int) from entregas e
          where e.projeto_id = ${projetoId} and e.deleted_at is null and e.situacao <> 'cancelado') as "entregasDemandadas",
        (select cast(count(distinct v.associacao_id) as int) from visitas v
          join projeto_associacoes pa on pa.associacao_id = v.associacao_id and pa.projeto_id = v.projeto_id
            and pa.ativo and pa.deleted_at is null
          where v.projeto_id = ${projetoId} and v.deleted_at is null and v.tipo = 'inicial_associacao'
            and v.situacao = 'realizada') as "associacoesVisitadas",
        (select cast(count(*) as int) from projeto_associacoes pa
          where pa.projeto_id = ${projetoId} and pa.ativo and pa.deleted_at is null) as "associacoes",
        (select cast(coalesce(sum(l.valor_centavos), 0) as bigint) from lancamentos_financeiros l
          where l.projeto_id = ${projetoId} and l.deleted_at is null and l.tipo = 'liberacao') as "liberadoCentavos",
        (select cast(coalesce(sum(l.valor_centavos), 0) as bigint) from lancamentos_financeiros l
          where l.projeto_id = ${projetoId} and l.deleted_at is null and l.tipo = 'despesa') as "gastoCentavos"`,
    );
    // bigint chega como string do driver
    return {
      ...row,
      liberadoCentavos: Number(row.liberadoCentavos),
      gastoCentavos: Number(row.gastoCentavos),
    };
  }

  async funil(projetoId: string, tx: DbOrTx = db) {
    const [situacoes, [{ termoAssinado }]] = await Promise.all([
      linhas<{ situacao: string; total: number }>(
        tx,
        sql`select e.situacao, cast(count(*) as int) as total from entregas e
          where e.projeto_id = ${projetoId} and e.deleted_at is null group by e.situacao`,
      ),
      linhas<{ termoAssinado: number }>(
        tx,
        sql`select cast(count(*) as int) as "termoAssinado" from entregas e
          where e.projeto_id = ${projetoId} and e.deleted_at is null and e.situacao = 'entregue'
            and exists (select 1 from assinaturas s where s.entrega_id = e.id and s.deleted_at is null)`,
      ),
    ]);
    return { situacoes, termoAssinado };
  }

  /** Documentos das associações do projeto: pendentes, rejeitados ou vencendo em 30 dias. */
  documentosPendentes(projetoId: string, hoje: string, tx: DbOrTx = db) {
    return listaCurta(
      tx,
      sql`d.id, d.associacao_id as "associacaoId", a.sigla as "associacaoSigla", t.nome as "tipoDocumento",
        d.situacao, to_char(d.validade, 'YYYY-MM-DD') as validade`,
      sql`from associacao_documentos d
        join associacoes a on a.id = d.associacao_id and a.deleted_at is null
        join projeto_associacoes pa on pa.associacao_id = d.associacao_id and pa.projeto_id = ${projetoId}
          and pa.ativo and pa.deleted_at is null
        join tipos_documento t on t.id = d.tipo_documento_id
        where d.deleted_at is null and (d.projeto_id is null or d.projeto_id = ${projetoId})
          and (d.situacao in ('pendente', 'rejeitado')
            or (d.validade is not null and d.validade <= ${hoje}::date + 30))`,
      sql`d.validade asc nulls last, a.sigla, t.nome`,
    );
  }

  entregasSemAssinatura(projetoId: string, tx: DbOrTx = db) {
    return listaCurta(
      tx,
      sql`e.id, i.descricao as "itemDescricao", a.sigla as "associacaoSigla",
        to_char(e.data_entrega, 'YYYY-MM-DD') as "dataEntrega"`,
      sql`from entregas e
        join itens i on i.id = e.item_id
        join associacoes a on a.id = e.associacao_id
        where e.projeto_id = ${projetoId} and e.deleted_at is null and e.situacao = 'entregue'
          and not exists (select 1 from assinaturas s where s.entrega_id = e.id and s.deleted_at is null)`,
      sql`e.data_entrega asc nulls last, e.id`,
    );
  }

  visitasSemAssinatura(projetoId: string, tx: DbOrTx = db) {
    return listaCurta(
      tx,
      resumoVisita,
      sql`from visitas v ${JOINS_RESUMO}
        where v.projeto_id = ${projetoId} and v.deleted_at is null and v.situacao = 'realizada'
          and ${ASSINAVEL} and ${SEM_ASSINATURA}`,
      sql`v.data asc, v.id`,
    );
  }

  recomendacoesVencidas(projetoId: string, hoje: string, tx: DbOrTx = db) {
    return listaCurta(
      tx,
      sql`r.id, r.descricao, to_char(r.prazo, 'YYYY-MM-DD') as prazo, r.visita_id as "visitaId", ${ONDE} as onde`,
      sql`from recomendacoes r
        join visitas v on v.id = r.visita_id and v.deleted_at is null
        ${JOINS_ONDE}
        where v.projeto_id = ${projetoId} and r.deleted_at is null
          and r.situacao in ('pendente', 'em_andamento') and r.prazo < ${hoje}::date`,
      sql`r.prazo asc, r.id`,
    );
  }

  // ─── Técnico ──────────────────────────────────────────────────────────────

  /** Visitas do usuário (responsável ou na equipe) dentro do escopo. */
  private minhas(userId: string, escopo: Escopo) {
    const noEscopo =
      escopo === undefined
        ? sql`true`
        : escopo.length === 0
          ? sql`false`
          : sql`v.projeto_id in (${sql.join(
              escopo.map((id) => sql`${id}`),
              sql`, `,
            )})`;
    return sql`v.deleted_at is null and ${noEscopo} and (v.tecnico_id = ${userId} or exists (
      select 1 from visita_equipe ve where ve.visita_id = v.id and ve.user_id = ${userId} and ve.deleted_at is null
    ))`;
  }

  async realizadasMes(userId: string, escopo: Escopo, hoje: string, tx: DbOrTx = db) {
    const [{ total }] = await linhas<{ total: number }>(
      tx,
      sql`select cast(count(*) as int) as total from visitas v
        where ${this.minhas(userId, escopo)} and v.situacao = 'realizada'
          and v.data >= date_trunc('month', ${hoje}::date)::date and v.data <= ${hoje}::date`,
    );
    return total;
  }

  agendadas(userId: string, escopo: Escopo, hoje: string, futuras: boolean, tx: DbOrTx = db) {
    return listaCurta(
      tx,
      resumoVisita,
      sql`from visitas v ${JOINS_RESUMO}
        where ${this.minhas(userId, escopo)} and v.situacao = 'agendada'
          and ${futuras ? sql`v.data >= ${hoje}::date` : sql`v.data < ${hoje}::date`}`,
      sql`v.data asc, v.id`,
    );
  }

  paraFechar(userId: string, escopo: Escopo, tx: DbOrTx = db) {
    const faltaRelato = sql`coalesce(btrim(v.relato), '') = ''`;
    const faltaFoto = sql`not exists (
      select 1 from visita_anexos va where va.visita_id = v.id and va.deleted_at is null
    )`;
    const faltaAssinatura = sql`(${ASSINAVEL} and ${SEM_ASSINATURA})`;
    return listaCurta(
      tx,
      sql`${resumoVisita}, ${faltaRelato} as "faltaRelato", ${faltaFoto} as "faltaFoto",
        ${faltaAssinatura} as "faltaAssinatura"`,
      sql`from visitas v ${JOINS_RESUMO}
        where ${this.minhas(userId, escopo)} and v.situacao = 'realizada'
          and (${faltaRelato} or ${faltaFoto} or ${faltaAssinatura})`,
      sql`v.data desc, v.id`,
    );
  }

  recomendacoes(userId: string, escopo: Escopo, hoje: string, tx: DbOrTx = db) {
    return listaCurta(
      tx,
      sql`r.id, r.descricao, to_char(r.prazo, 'YYYY-MM-DD') as prazo, r.prazo < ${hoje}::date as vencida,
        r.visita_id as "visitaId", ${ONDE} as onde`,
      sql`from recomendacoes r
        join visitas v on v.id = r.visita_id
        ${JOINS_ONDE}
        where ${this.minhas(userId, escopo)} and r.deleted_at is null
          and r.situacao in ('pendente', 'em_andamento') and r.prazo <= ${hoje}::date + 15`,
      sql`r.prazo asc, r.id`,
    );
  }
}
