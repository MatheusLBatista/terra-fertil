---
name: form-pattern
description: Padrão canônico de cadastro e edição no painel (frontend/) — Sheet lateral com formulário local à página, react-hook-form + zodResolver (zod v4) ou useState, mutation via useMutation + fetchData (POST/PATCH/PUT) com invalidateQueries + toast, e ConfirmacaoDialog para ação destrutiva. Use ao criar ou revisar cadastro/edição — "cadastrar X", "formulário de X", "editar X", "criar X pela tela", "confirmar exclusão de X".
---

# form-pattern — cadastro e edição

Referências vivas: `frontend/app/(auth)/papeis/page.tsx` (criar/editar num único `FormularioPapel`
com `registro?`, editor de linhas dinâmicas com PUT) e `frontend/app/(auth)/usuarios/page.tsx`
(sheets `NovoUsuario`/`EditarUsuario`, banimento com motivo dentro do `ConfirmacaoDialog`).
Leia uma delas antes de escrever; a tela de lista de onde o formulário parte segue a skill
`data-table-pattern`.

## Qual componente

| Situação | Componente | Existe em `components/ui`? |
|---|---|---|
| Criar/editar uma entidade a partir da lista | `Sheet` (lateral, `side="right"`) | sim (`sheet.tsx`) |
| Confirmar ação destrutiva, com ou sem campo de motivo | `ConfirmacaoDialog` (por cima do `AlertDialog`) | sim (`components/confirmacao-dialog.tsx`, `ui/alert-dialog.tsx`) |
| Ação curta e focada fora de uma lista (ex.: trocar senha) | `Dialog` | sim (`dialog.tsx`; referência viva: `components/trocar-senha-dialog.tsx`) |

`ConfirmacaoDialog` recebe `confirmacao: Confirmacao | null` montado **no render** a partir de um
`useState<Registro | null>`; `pendente: mutation.isPending` desabilita os botões enquanto a mutation
roda. Campo extra (motivo) vai em `children` com estado próprio na página:

```tsx
const [banir, setBanir] = useState<Usuario | null>(null);
const [motivo, setMotivo] = useState("");

const confirmacao: Confirmacao | null = banir
  ? {
      titulo: "Banir usuário",
      descricao: <><strong>{banir.email}</strong> perde o acesso imediatamente.</>,
      textoConfirmar: "Banir",
      destrutivo: true,
      pendente: banirMutation.isPending,
      onConfirmar: () => banirMutation.mutate(),
      children: (
        <div className="grid gap-1.5 px-1">
          <Label htmlFor="ban-motivo">Motivo (opcional)</Label>
          <Input id="ban-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} />
        </div>
      ),
    }
  : null;

<ConfirmacaoDialog confirmacao={confirmacao} onFechar={() => { setBanir(null); setMotivo(""); }} />
```

## Estado do formulário

- **Cadastro/edição no painel**: sempre `react-hook-form` + `zodResolver` (referências vivas: `usuarios/page.tsx`, `papeis/page.tsx`). `useState` só nas telas públicas de autenticação e no `TrocarSenhaDialog`.
  (`papeis/page.tsx`). O submit fica `disabled={!podeSalvar || salvar.isPending}`.
- **Com validação declarativa**: `react-hook-form` + `zodResolver` (`@hookform/resolvers/zod`),
  zod v4. Regras que quebram no zod v4:
  - número: `z.number()` no schema + `register("campo", { valueAsNumber: true })`. **Nunca**
    `z.coerce` dentro do resolver.
  - máscara/transform no schema: `type FormValues = z.input<typeof schema>` (o que o input guarda)
    e `type FormOutput = z.output<typeof schema>` (o que a API recebe);
    `useForm<FormValues, unknown, FormOutput>` e `handleSubmit((dados: FormOutput) => …)`.
  - `Checkbox`/`Switch` do base-ui não são `<input>`: use `Controller` com
    `checked={field.value}` e `onCheckedChange={(v) => field.onChange(v)}`.
- **Montar só enquanto aberto e remontar por `key`** — nunca sincronizar com `useEffect` (o lint
  `react-hooks/set-state-in-effect` recusa `setState`/`reset` em efeito). O estado inicial nasce das
  props (`registro?.nome ?? ""` / `defaultValues`):

```tsx
{novoAberto && <Formulario onFechar={() => setNovoAberto(false)} />}
{editar && <Formulario key={editar.id} registro={editar} onFechar={() => setEditar(null)} />}
```

## Mutation

```tsx
const salvar = useMutation({
  mutationFn: (dados: FormOutput) =>
    registro
      ? fetchData(`/produtos/${registro.id}`, { method: "PATCH", body: dados })
      : fetchData("/produtos", { method: "POST", body: dados }),
  onSuccess: () => {
    toast.success(registro ? "Produto atualizado." : "Produto criado.");
    queryClient.invalidateQueries({ queryKey: ["produtos"] });
    onFechar();
  },
  onError: (erro) => {
    const api = erro as ErroApi;
    if (api.status === 400 && api.erros?.length) setErrosApi(api.erros);
    else toast.error(mensagemDeErro(erro, "Não foi possível salvar o produto."));
  },
});
```

- `queryKey` da invalidação é o **prefixo** da lista (`["produtos"]`, sem filtros/página).
- Substituição de conjunto (linhas dinâmicas): `PUT` com o array inteiro, como
  `PUT /papeis/:id/permissoes` — a tela guarda `useState<Item[]>` e o botão "Adicionar" faz
  `setLinhas((atual) => [...atual, { …vazio }])`.
- `400` de validação da API traz `erros: string[]` (`ErroApi`): mostre **inline** no topo do
  formulário (`role="alert"`), não só no toast. O mesmo 400 traz `meta.campos`
  (`{ campo: mensagem }`, montado por `respostaValidacao` no back) — use-o para marcar o
  input certo com `setError(campo, { message })` quando o campo existir no formulário.
  Qualquer outro erro: `toast.error(mensagemDeErro(...))`.
- Submit: `disabled={salvar.isPending}` com `<Spinner /> Salvando…` dentro do botão.

## Esqueleto (criar + editar num só `Formulario`)

Entidade `Produto` (`POST /produtos`, `PATCH /produtos/:id`), no mesmo `app/(auth)/produtos/page.tsx`
da listagem. Só os trechos de formulário; a tabela segue `data-table-pattern`.

```tsx
"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { Plus } from "lucide-react";
import { PageLayout } from "@/components/page-layout";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmacaoDialog, type Confirmacao } from "@/components/confirmacao-dialog";
import { fetchData, mensagemDeErro, type ErroApi } from "@/lib/fetchData";
import type { Envelope } from "@/types/envelope";
import type { components } from "@/types/api";

type Produto = components["schemas"]["Produto"];
type Categoria = components["schemas"]["Categoria"];

const schema = z.object({
  nome: z.string().trim().min(1, "Informe o nome").max(120, "No máximo 120 caracteres"),
  descricao: z.string().trim().max(500, "No máximo 500 caracteres").optional(),
  categoriaId: z.string().min(1, "Selecione a categoria"),
  precoCentavos: z.number({ error: "Informe o preço" }).int("Use um valor inteiro em centavos").nonnegative("Não pode ser negativo"),
  ativo: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

export default function ProdutosPage() {
  const queryClient = useQueryClient();
  const [novoAberto, setNovoAberto] = useState(false);
  const [editar, setEditar] = useState<Produto | null>(null);
  const [excluir, setExcluir] = useState<Produto | null>(null);

  const excluirMutation = useMutation({
    mutationFn: () => fetchData(`/produtos/${excluir!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Produto excluído.");
      setExcluir(null);
      queryClient.invalidateQueries({ queryKey: ["produtos"] });
    },
    onError: (erro) => toast.error(mensagemDeErro(erro, "Não foi possível excluir o produto.")),
  });

  const confirmacaoExcluir: Confirmacao | null = excluir
    ? {
        titulo: `Excluir “${excluir.nome}”?`,
        descricao: "Exclusão lógica: o registro some das listagens, mas fica no histórico.",
        textoConfirmar: "Excluir",
        destrutivo: true,
        pendente: excluirMutation.isPending,
        onConfirmar: () => excluirMutation.mutate(),
      }
    : null;

  return (
    <PageLayout
      title="Produtos"
      actions={
        <Button onClick={() => setNovoAberto(true)}>
          <Plus /> Novo produto
        </Button>
      }
    >
      {/* tabela: coluna Ações com <Button aria-label={`Editar ${p.nome}`} onClick={() => setEditar(p)}> e
          <Button aria-label={`Excluir ${p.nome}`} onClick={() => setExcluir(p)}> — ver data-table-pattern */}

      <Sheet open={novoAberto} onOpenChange={setNovoAberto}>
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>Novo produto</SheetTitle>
            <SheetDescription>O produto nasce ativo e aparece na lista ao salvar.</SheetDescription>
          </SheetHeader>
          {novoAberto && <Formulario onFechar={() => setNovoAberto(false)} />}
        </SheetContent>
      </Sheet>

      <Sheet open={editar !== null} onOpenChange={(aberto) => !aberto && setEditar(null)}>
        <SheetContent className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>Editar produto</SheetTitle>
            <SheetDescription>Alterações valem assim que salvar.</SheetDescription>
          </SheetHeader>
          {editar && <Formulario key={editar.id} registro={editar} onFechar={() => setEditar(null)} />}
        </SheetContent>
      </Sheet>

      <ConfirmacaoDialog confirmacao={confirmacaoExcluir} onFechar={() => setExcluir(null)} />
    </PageLayout>
  );
}

function Formulario({ registro, onFechar }: { registro?: Produto; onFechar: () => void }) {
  const queryClient = useQueryClient();
  const [errosApi, setErrosApi] = useState<string[]>([]);

  const categorias = useQuery({
    queryKey: ["categorias"],
    queryFn: ({ signal }) => fetchData<Envelope<Categoria[]>>("/categorias", { query: { limit: 100 }, signal }),
  });

  const { register, control, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      nome: registro?.nome ?? "",
      descricao: registro?.descricao ?? "",
      categoriaId: registro?.categoriaId ?? "",
      precoCentavos: registro?.precoCentavos ?? 0,
      ativo: registro?.ativo ?? true,
    },
  });

  const salvar = useMutation({
    mutationFn: (dados: FormValues) =>
      registro
        ? fetchData(`/produtos/${registro.id}`, { method: "PATCH", body: dados })
        : fetchData("/produtos", { method: "POST", body: dados }),
    onSuccess: () => {
      toast.success(registro ? "Produto atualizado." : "Produto criado.");
      queryClient.invalidateQueries({ queryKey: ["produtos"] });
      onFechar();
    },
    onError: (erro) => {
      const api = erro as ErroApi;
      if (api.status === 400 && api.erros?.length) setErrosApi(api.erros);
      else toast.error(mensagemDeErro(erro, "Não foi possível salvar o produto."));
    },
  });

  return (
    <form
      className="flex flex-1 flex-col overflow-hidden"
      noValidate
      onSubmit={handleSubmit((dados) => {
        setErrosApi([]);
        salvar.mutate(dados);
      })}
    >
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        {errosApi.length > 0 && (
          <ul role="alert" className="list-disc pl-4 text-xs text-destructive">
            {errosApi.map((e) => <li key={e}>{e}</li>)}
          </ul>
        )}

        <div className="grid gap-1.5">
          <Label htmlFor="produto-nome">Nome</Label>
          <Input
            id="produto-nome"
            maxLength={120}
            aria-invalid={!!errors.nome}
            aria-describedby={errors.nome ? "produto-nome-erro" : undefined}
            {...register("nome")}
          />
          {errors.nome && <p id="produto-nome-erro" className="text-xs text-destructive">{errors.nome.message}</p>}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="produto-descricao">Descrição</Label>
          <Textarea
            id="produto-descricao"
            aria-invalid={!!errors.descricao}
            aria-describedby={errors.descricao ? "produto-descricao-erro" : undefined}
            {...register("descricao")}
          />
          {errors.descricao && <p id="produto-descricao-erro" className="text-xs text-destructive">{errors.descricao.message}</p>}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="produto-categoria">Categoria</Label>
          <NativeSelect
            id="produto-categoria"
            className="w-full"
            disabled={categorias.isPending}
            aria-invalid={!!errors.categoriaId}
            aria-describedby={errors.categoriaId ? "produto-categoria-erro" : undefined}
            {...register("categoriaId")}
          >
            <NativeSelectOption value="">Selecione…</NativeSelectOption>
            {(categorias.data?.data ?? []).map((c) => (
              <NativeSelectOption key={c.id} value={c.id}>{c.nome}</NativeSelectOption>
            ))}
          </NativeSelect>
          {errors.categoriaId && <p id="produto-categoria-erro" className="text-xs text-destructive">{errors.categoriaId.message}</p>}
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="produto-preco">Preço (centavos)</Label>
          <Input
            id="produto-preco"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            aria-invalid={!!errors.precoCentavos}
            aria-describedby={errors.precoCentavos ? "produto-preco-erro" : undefined}
            {...register("precoCentavos", { valueAsNumber: true })}
          />
          {errors.precoCentavos && <p id="produto-preco-erro" className="text-xs text-destructive">{errors.precoCentavos.message}</p>}
        </div>

        <div className="flex items-center gap-2">
          <Controller
            control={control}
            name="ativo"
            render={({ field }) => (
              <Checkbox id="produto-ativo" checked={field.value} onCheckedChange={(v) => field.onChange(v)} />
            )}
          />
          <Label htmlFor="produto-ativo">Ativo</Label>
        </div>
      </div>

      <SheetFooter className="flex-row justify-end gap-2 border-t">
        <Button type="button" variant="outline" onClick={onFechar}>Cancelar</Button>
        <Button type="submit" disabled={salvar.isPending}>
          {salvar.isPending ? <><Spinner /> Salvando…</> : registro ? "Salvar" : "Criar"}
        </Button>
      </SheetFooter>
    </form>
  );
}
```

Pontos do esqueleto que o revisor confere:

- `noValidate` no `<form>`: a validação é do zod; sem isso o browser bloqueia o submit com balão
  próprio (em inglês) antes do resolver.
- Cada campo: `Label htmlFor` ↔ `id`; erro em `<p id="…-erro">` referenciado por `aria-describedby`
  e `aria-invalid` no controle (o `Input`/`Textarea`/`NativeSelect` já pintam a borda por `aria-invalid`).
- `NativeSelect` com `register` funciona porque é um `<select>` nativo (a opção vazia primeiro).
- `Seletor` (combobox com busca) em vez de `NativeSelect` quando há muitas opções: `Controller` com
  `valor={field.value}` / `onValorChange={field.onChange}` e `id` + `aria-label`.
- Nada de `autoFocus`: o base-ui foca o primeiro campo ao abrir o `Sheet`.
- Com `useState` no lugar do RHF, os mesmos atributos ARIA valem (`aria-invalid={senhaInvalida}` +
  `<p id>` + `aria-describedby`), como em `usuarios/page.tsx`.

## Enter entre campos

`EnterFieldNavigation` (montado em `app/(auth)/layout.tsx`) é global: dentro de um `<form>`, Enter
num `<input>` foca o próximo campo (`input`/`textarea`/`select` visível e habilitado) e só no último
submete. `<textarea>`, botões, `checkbox`/`radio`/`file` e combobox com lista aberta
(`aria-expanded="true"`) ficam com o Enter normal. Consequências para o formulário:

- Não trate Enter à mão nos inputs (`onKeyDown`); ponha o campo dentro do `<form>` e pronto.
- Campo fora de `<form>` (ex.: motivo dentro do `ConfirmacaoDialog`) não participa — o Enter ali
  não submete nada, o usuário clica em confirmar.

## Regras

- **Tudo no `page.tsx`**: `Formulario` é uma `function` local do arquivo, sem componente/hook de
  formulário compartilhado. O `schema` zod fica no topo do mesmo arquivo.
- **Comentários só para decisão não óbvia** — o padrão está documentado aqui.
- **Rótulos, mensagens e toasts em pt-BR**; mensagens de erro do zod escritas no schema (o padrão
  do zod é em inglês).
- **shadcn base-ui**: `render={…}` em vez de `asChild`; `Button` que vira `Link` leva
  `nativeButton={false}`. `Checkbox`/`Switch` usam `onCheckedChange`, não `onChange`.
- **`fetchData(path, { method, body })`** — não existe token, a sessão vai no cookie; `PUT` de conjunto é `{ method: "PUT", body: { permissoes } }`.
- **Sem `useEffect` para popular/resetar** o formulário — `key` e montagem condicional.
- **Dinheiro em centavos** (inteiro) no schema e no body; conversão de exibição só na célula da tabela.

## Checklist

1. Endpoint na API (skill `create-routes`) com `CreateXSchema`/`UpdateXSchema`; permissões
   `create`/`update`/`delete` do Subject no seed `backend/src/seeds/papeis.ts` + `npm run db:seed:papeis`.
2. `cd frontend && npm run types` (API no ar) — o tipo do body vem de `components["schemas"]`.
3. Formulário escrito no `page.tsx` seguindo o esqueleto (Sheet montado só aberto, `key` na edição).
4. `npx tsc --noEmit` → `npm run lint` (sem `set-state-in-effect`) — ou `make check` na raiz.
5. Skill `ui-verify` com `ROTAS=/<entidade>` e leitura dos prints (abrir o sheet não entra no print:
   confira no browser em 375px que o rodapé do sheet fica visível com o teclado aberto).
6. Skill `acessibility` na rota: Tab pelo formulário, Esc fecha e devolve o foco ao botão de origem,
   erro lido junto do campo.
