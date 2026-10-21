-- ============================================================================
-- Histórico de alterações — trigger genérica para todos os models
--
-- Registra INSERT / UPDATE / DELETE de cada tabela auditada na tabela única
-- `historico_alteracoes`. O usuário responsável é lido das colunas de auditoria
-- do próprio registro (created_by na inserção, updated_by nas demais operações),
-- preenchidas automaticamente pela aplicação. Num DELETE FÍSICO o autor vem do
-- GUC `app.user_id` quando a aplicação o definiu na transação
-- (`comUsuarioNaSessao` em src/db/index.ts), senão de `updated_by`.
--
-- registro_id: a chave primária REAL da tabela (pg_index); PK composta vira os
-- valores unidos por ":". Sem PK, usa a coluna `id`; sem ela, NULL.
--
-- UPDATE sem mudança (ignorando updated_at/updated_by, que a aplicação sempre
-- toca) não gera linha — evita ruído de PATCH idempotente.
--
-- Soft delete: quando um UPDATE preenche `deleted_at` (de nulo para não-nulo),
-- a operação é registrada como DELETE (exclusão), não como alteração — é assim
-- que a exclusão pela interface (soft delete) aparece no histórico.
--
-- Cobertura AUTOMÁTICA: a trigger é (re)criada em TODA tabela do schema `public`
-- que tenha a coluna `deleted_at` (marca de soft delete presente em todos os
-- models de domínio via `auditColumns`). Assim, novos models passam a ser
-- auditados sem precisar editar esta lista — basta rodar `bun run db:triggers`.
--
-- Aplicar com:  bun run db:triggers
-- ============================================================================

-- Chave primária do registro a partir do catálogo (fallback: coluna `id`).
CREATE OR REPLACE FUNCTION fn_historico_registro_id(p_rel oid, p_linha jsonb) RETURNS text AS $$
  SELECT COALESCE(
    (SELECT string_agg(p_linha ->> a.attname, ':' ORDER BY array_position(i.indkey::int2[], a.attnum))
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
      WHERE i.indrelid = p_rel AND i.indisprimary),
    p_linha ->> 'id'
  );
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION fn_registrar_historico() RETURNS trigger AS $$
DECLARE
  v_old          jsonb;
  v_new          jsonb;
  v_registro_id  text;
  v_alterado_por text;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    v_old          := to_jsonb(OLD);
    v_registro_id  := fn_historico_registro_id(TG_RELID, v_old);
    v_alterado_por := COALESCE(NULLIF(current_setting('app.user_id', true), ''), v_old ->> 'updated_by');
    INSERT INTO historico_alteracoes
      (tabela, registro_id, operacao, dados_anteriores, dados_novos, alterado_por)
    VALUES
      (TG_TABLE_NAME, v_registro_id, 'DELETE', v_old, NULL, v_alterado_por);
    RETURN OLD;

  ELSIF (TG_OP = 'UPDATE') THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    -- Nada mudou além do carimbo de auditoria → não registra
    IF (v_new - 'updated_at' - 'updated_by') = (v_old - 'updated_at' - 'updated_by') THEN
      RETURN NEW;
    END IF;
    v_registro_id  := fn_historico_registro_id(TG_RELID, v_new);
    v_alterado_por := v_new ->> 'updated_by';
    -- Soft delete (deleted_at foi de NULO para preenchido) → registra como DELETE.
    IF (v_old ->> 'deleted_at') IS NULL AND (v_new ->> 'deleted_at') IS NOT NULL THEN
      INSERT INTO historico_alteracoes
        (tabela, registro_id, operacao, dados_anteriores, dados_novos, alterado_por)
      VALUES
        (TG_TABLE_NAME, v_registro_id, 'DELETE', v_old, v_new, v_alterado_por);
    ELSE
      INSERT INTO historico_alteracoes
        (tabela, registro_id, operacao, dados_anteriores, dados_novos, alterado_por)
      VALUES
        (TG_TABLE_NAME, v_registro_id, 'UPDATE', v_old, v_new, v_alterado_por);
    END IF;
    RETURN NEW;

  ELSIF (TG_OP = 'INSERT') THEN
    v_new          := to_jsonb(NEW);
    v_registro_id  := fn_historico_registro_id(TG_RELID, v_new);
    v_alterado_por := v_new ->> 'created_by';
    INSERT INTO historico_alteracoes
      (tabela, registro_id, operacao, dados_anteriores, dados_novos, alterado_por)
    VALUES
      (TG_TABLE_NAME, v_registro_id, 'INSERT', NULL, v_new, v_alterado_por);
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Cria (ou recria) a trigger em toda tabela auditada — descoberta automática:
-- qualquer tabela de `public` com a coluna `deleted_at` (soft delete). Exclui a
-- própria `historico_alteracoes` (não tem `deleted_at`, logo já fica de fora).
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name  = 'deleted_at'
      AND table_name  <> 'historico_alteracoes'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_historico ON %I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_historico
         AFTER INSERT OR UPDATE OR DELETE ON %I
         FOR EACH ROW EXECUTE FUNCTION fn_registrar_historico()',
      t
    );
    RAISE NOTICE 'trg_historico aplicada em %', t;
  END LOOP;
END $$;
