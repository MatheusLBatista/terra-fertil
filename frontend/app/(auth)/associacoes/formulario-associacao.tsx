"use client";

// Formulário de cadastro/edição da associação — o mesmo na lista (/associacoes) e no
// detalhe (/associacoes/[id]). Fica ao lado das duas páginas (não é rota) para não
// duplicar ~300 linhas; o resto de cada tela segue no próprio page.tsx.

import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";

import { SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Seletor } from "@/components/seletor";
import { useProjetos } from "@/hooks/use-projetos";
import { fetchData, mensagemDeErro } from "@/lib/fetchData";
import { aplicarErrosDaApi } from "@/lib/erros-form";
import { usePapel } from "@/lib/papeis";
import type { Envelope } from "@/types/envelope";
import type { components } from "@/types/api";

export type Associacao = components["schemas"]["Associacao"];
type Municipio = components["schemas"]["Municipio"];
type MetaPaginacao = components["schemas"]["MetaPaginacao"];

/** Rondônia (código IBGE) — os municípios dos selects. */
const ESTADO_RO = 11;

/** Municípios de RO para filtros e formulários — uma consulta, uma key. */
export function useMunicipiosRO() {
  const query = useQuery({
    queryKey: ["municipios", { estadoId: ESTADO_RO, limit: 200 }],
    queryFn: ({ signal }) =>
      fetchData<Envelope<Municipio[], MetaPaginacao>>("/municipios", {
        query: { estadoId: ESTADO_RO, limit: 200 },
        signal,
      }),
  });
  const opcoes = useMemo(
    () => (query.data?.data ?? []).map((m) => ({ value: String(m.id), label: m.nome })),
    [query.data],
  );
  return { ...query, opcoes };
}

/** "07638987000113" → "07.638.987/0001-13" (aplica também enquanto digita). */
export function mascaraCnpj(valor?: string | null) {
  const d = (valor ?? "").replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

/** Número digitado (aceita vírgula decimal) → número ou null quando vazio. */
const numeroOpcional = (
  { inteiro = false, min, max }: { inteiro?: boolean; min: number; max?: number },
  mensagem: string,
) =>
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v.replace(",", "."))))
    .refine(
      (n) =>
        n === null ||
        (Number.isFinite(n) &&
          n >= min &&
          (max === undefined || n <= max) &&
          (!inteiro || Number.isInteger(n))),
      mensagem,
    );

const linkOpcional = z
  .union([z.literal(""), z.url("Link inválido (comece com https://)")])
  .transform((v) => v || null);

const schema = z
  .object({
    sigla: z.string().trim().min(1, "Informe a sigla").max(60, "No máximo 60 caracteres"),
    nome: z.string().trim().max(300, "No máximo 300 caracteres"),
    cnpj: z
      .string()
      .transform((v) => v.replace(/\D/g, ""))
      .refine((v) => v === "" || v.length === 14, "O CNPJ tem 14 dígitos")
      .transform((v) => v || null),
    municipioId: z.string().min(1, "Escolha o município").transform(Number),
    distrito: z.string().trim().max(120, "No máximo 120 caracteres"),
    endereco: z.string().trim().max(300, "No máximo 300 caracteres"),
    numProdutores: numeroOpcional({ inteiro: true, min: 0 }, "Informe um número inteiro"),
    numFamilias: numeroOpcional({ inteiro: true, min: 0 }, "Informe um número inteiro"),
    areaMediaHa: numeroOpcional({ min: 0 }, "Área inválida (ex.: 12,5)"),
    latitude: numeroOpcional({ min: -90, max: 90 }, "Latitude entre -90 e 90 (ex.: -12,7406)"),
    longitude: numeroOpcional({ min: -180, max: 180 }, "Longitude entre -180 e 180 (ex.: -60,1458)"),
    mapaUrl: linkOpcional,
    grupoWhatsappUrl: linkOpcional,
    dadosRevisados: z.boolean(),
    ativo: z.boolean(),
    projetoId: z.string(),
  })
  .refine((v) => (v.latitude === null) === (v.longitude === null), {
    message: "Informe latitude e longitude juntas",
    path: ["longitude"],
  });
const schemaComProjeto = schema.refine((v) => v.projetoId !== "", {
  message: "Escolha o projeto",
  path: ["projetoId"],
});
type FormValues = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

const texto = (n?: number | null) => (n === null || n === undefined ? "" : String(n).replace(".", ","));

export function FormularioAssociacao({
  registro,
  onFechar,
}: {
  registro?: Associacao;
  onFechar: () => void;
}) {
  const queryClient = useQueryClient();
  const { podeGerenciar } = usePapel();
  // Gestor/admin veem todos os projetos e podem cadastrar só a associação;
  // os demais precisam ligá-la a um projeto (senão ela some da lista deles).
  const exigeProjeto = !registro && !podeGerenciar("gestor");
  const projetos = useProjetos();
  const municipios = useMunicipiosRO();
  const [errosApi, setErrosApi] = useState<string[]>([]);

  const form = useForm<FormValues, unknown, FormOutput>({
    resolver: zodResolver(exigeProjeto ? schemaComProjeto : schema),
    defaultValues: {
      sigla: registro?.sigla ?? "",
      nome: registro?.nome ?? "",
      cnpj: mascaraCnpj(registro?.cnpj),
      municipioId: registro ? String(registro.municipioId) : "",
      distrito: registro?.distrito ?? "",
      endereco: registro?.endereco ?? "",
      numProdutores: texto(registro?.numProdutores),
      numFamilias: texto(registro?.numFamilias),
      areaMediaHa: texto(registro?.areaMediaHa),
      latitude: texto(registro?.latitude),
      longitude: texto(registro?.longitude),
      mapaUrl: registro?.mapaUrl ?? "",
      grupoWhatsappUrl: registro?.grupoWhatsappUrl ?? "",
      dadosRevisados: registro?.dadosRevisados ?? false,
      ativo: registro?.ativo ?? true,
      projetoId: projetos.unico ?? "",
    },
  });
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = form;

  const salvar = useMutation({
    mutationFn: ({ projetoId, ...d }: FormOutput) => {
      const body = { ...d, nome: d.nome || null, distrito: d.distrito || null, endereco: d.endereco || null };
      return registro
        ? fetchData(`/associacoes/${registro.id}`, { method: "PATCH", body })
        : fetchData("/associacoes", {
            method: "POST",
            body: { ...body, projetoId: projetoId || undefined },
          });
    },
    onSuccess: () => {
      toast.success(registro ? "Associação atualizada." : "Associação cadastrada.");
      queryClient.invalidateQueries({ queryKey: ["associacoes"] });
      onFechar();
    },
    onError: (erro) => {
      const erros = aplicarErrosDaApi(erro, form);
      if (erros) setErrosApi(erros);
      else toast.error(mensagemDeErro(erro, "Não foi possível salvar a associação."));
    },
  });

  const aria = (nome: keyof FormValues) => ({
    id: `associacao-${nome}`,
    "aria-invalid": !!errors[nome],
    "aria-describedby": errors[nome] ? `associacao-${nome}-erro` : undefined,
  });
  const erro = (nome: keyof FormValues) =>
    errors[nome] && (
      <p id={`associacao-${nome}-erro`} role="alert" className="text-xs text-destructive">
        {errors[nome]?.message}
      </p>
    );

  return (
    <form
      className="flex flex-1 flex-col overflow-hidden"
      noValidate
      onSubmit={handleSubmit((d) => {
        setErrosApi([]);
        salvar.mutate(d);
      })}
    >
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        {errosApi.length > 0 && (
          <ul role="alert" className="list-disc pl-4 text-xs text-destructive">
            {errosApi.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}

        {!registro && (
          <div className="grid gap-1.5">
            <Label htmlFor="associacao-projetoId">Projeto</Label>
            <NativeSelect
              className="w-full"
              disabled={projetos.isPending}
              {...aria("projetoId")}
              {...register("projetoId")}
            >
              {exigeProjeto ? (
                <NativeSelectOption value="">Selecione…</NativeSelectOption>
              ) : (
                <NativeSelectOption value="">Nenhum (só o cadastro)</NativeSelectOption>
              )}
              {projetos.opcoes.map((p) => (
                <NativeSelectOption key={p.value} value={p.value}>
                  {p.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <p className="text-xs text-muted-foreground">
              A associação já entra como participante do projeto.
            </p>
            {erro("projetoId")}
          </div>
        )}

        <div className="grid grid-cols-[1fr_2fr] gap-3">
          <div className="grid content-start gap-1.5">
            <Label htmlFor="associacao-sigla">Sigla</Label>
            <Input placeholder="APROVI" maxLength={60} {...aria("sigla")} {...register("sigla")} />
            {erro("sigla")}
          </div>
          <div className="grid content-start gap-1.5">
            <Label htmlFor="associacao-cnpj">CNPJ (opcional)</Label>
            <Controller
              control={control}
              name="cnpj"
              render={({ field }) => (
                <Input
                  inputMode="numeric"
                  placeholder="00.000.000/0000-00"
                  {...aria("cnpj")}
                  name={field.name}
                  ref={field.ref}
                  value={field.value}
                  onBlur={field.onBlur}
                  onChange={(e) => field.onChange(mascaraCnpj(e.target.value))}
                />
              )}
            />
            {erro("cnpj")}
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="associacao-nome">Nome completo</Label>
          <Input maxLength={300} {...aria("nome")} {...register("nome")} />
          {erro("nome")}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="associacao-municipioId">Município</Label>
          <Controller
            control={control}
            name="municipioId"
            render={({ field }) => (
              <Seletor
                className="w-full"
                opcoes={municipios.opcoes}
                valor={field.value}
                onValorChange={(v) => field.onChange(v ?? "")}
                placeholder="Buscar município…"
                vazio="Nenhum município encontrado."
                disabled={municipios.isPending}
                {...aria("municipioId")}
              />
            )}
          />
          {erro("municipioId")}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid content-start gap-1.5">
            <Label htmlFor="associacao-distrito">Distrito / linha</Label>
            <Input maxLength={120} {...aria("distrito")} {...register("distrito")} />
            {erro("distrito")}
          </div>
          <div className="grid content-start gap-1.5">
            <Label htmlFor="associacao-endereco">Endereço</Label>
            <Input maxLength={300} {...aria("endereco")} {...register("endereco")} />
            {erro("endereco")}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="grid content-start gap-1.5">
            <Label htmlFor="associacao-numProdutores">Produtores</Label>
            <Input inputMode="numeric" {...aria("numProdutores")} {...register("numProdutores")} />
            {erro("numProdutores")}
          </div>
          <div className="grid content-start gap-1.5">
            <Label htmlFor="associacao-numFamilias">Famílias</Label>
            <Input inputMode="numeric" {...aria("numFamilias")} {...register("numFamilias")} />
            {erro("numFamilias")}
          </div>
          <div className="grid content-start gap-1.5">
            <Label htmlFor="associacao-areaMediaHa">Área média (ha)</Label>
            <Input inputMode="decimal" {...aria("areaMediaHa")} {...register("areaMediaHa")} />
            {erro("areaMediaHa")}
          </div>
        </div>

        <fieldset className="grid gap-1.5">
          <legend className="mb-1 text-sm font-medium">Coordenadas da sede (opcional)</legend>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid content-start gap-1.5">
              <Label htmlFor="associacao-latitude" className="text-xs text-muted-foreground">
                Latitude
              </Label>
              <Input
                inputMode="decimal"
                placeholder="-12,7406"
                {...aria("latitude")}
                {...register("latitude")}
              />
              {erro("latitude")}
            </div>
            <div className="grid content-start gap-1.5">
              <Label htmlFor="associacao-longitude" className="text-xs text-muted-foreground">
                Longitude
              </Label>
              <Input
                inputMode="decimal"
                placeholder="-60,1458"
                {...aria("longitude")}
                {...register("longitude")}
              />
              {erro("longitude")}
            </div>
          </div>
        </fieldset>

        <div className="grid gap-1.5">
          <Label htmlFor="associacao-mapaUrl">Link do mapa</Label>
          <Input
            type="url"
            placeholder="https://maps.app.goo.gl/…"
            {...aria("mapaUrl")}
            {...register("mapaUrl")}
          />
          {erro("mapaUrl")}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="associacao-grupoWhatsappUrl">Grupo do WhatsApp</Label>
          <Input
            type="url"
            placeholder="https://chat.whatsapp.com/…"
            {...aria("grupoWhatsappUrl")}
            {...register("grupoWhatsappUrl")}
          />
          {erro("grupoWhatsappUrl")}
        </div>

        <div className="flex items-center gap-2">
          <Controller
            control={control}
            name="dadosRevisados"
            render={({ field }) => (
              <Checkbox
                id="associacao-dadosRevisados"
                checked={field.value}
                onCheckedChange={(v) => field.onChange(v)}
              />
            )}
          />
          <Label htmlFor="associacao-dadosRevisados">Dados revisados</Label>
        </div>

        {registro && (
          <div className="flex items-center gap-2">
            <Controller
              control={control}
              name="ativo"
              render={({ field }) => (
                <Checkbox
                  id="associacao-ativo"
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(v)}
                />
              )}
            />
            <Label htmlFor="associacao-ativo">Associação ativa</Label>
          </div>
        )}
      </div>

      <SheetFooter className="flex-row justify-end gap-2 border-t">
        <Button type="button" variant="outline" onClick={onFechar}>
          Cancelar
        </Button>
        <Button type="submit" disabled={salvar.isPending}>
          {salvar.isPending ? (
            <>
              <Spinner /> Salvando…
            </>
          ) : registro ? (
            "Salvar"
          ) : (
            "Cadastrar"
          )}
        </Button>
      </SheetFooter>
    </form>
  );
}
