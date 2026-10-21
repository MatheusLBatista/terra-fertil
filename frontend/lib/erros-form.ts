import { get, type FieldValues, type Path, type UseFormReturn } from "react-hook-form";

import type { ErroApi } from "@/lib/fetchData";

/**
 * 400 da API num formulário react-hook-form: cada campo de `meta.campos` que
 * existe no formulário ganha `setError` (erro inline no input, o primeiro recebe
 * o foco) e o que sobra (campo fora do formulário, erro sem campo, 400 de regra
 * sem `meta.campos`) volta como lista para o bloco `role="alert"` do topo.
 * Devolve `null` quando o erro não é um 400 — aí quem chama mostra o toast.
 *
 * ```ts
 * onError: (erro) => {
 *   const erros = aplicarErrosDaApi(erro, form);
 *   if (erros) setErrosApi(erros);
 *   else toast.error(mensagemDeErro(erro, "Não foi possível salvar."));
 * },
 * ```
 *
 * Os nomes dos campos do formulário precisam ser os do body da API.
 * Só para o `fetchData`: erro do `authClient` não traz `meta.campos`.
 */
export function aplicarErrosDaApi<T extends FieldValues>(
  erro: unknown,
  form: Pick<UseFormReturn<T>, "setError" | "getValues">,
): string[] | null {
  const api = erro as Partial<ErroApi> | null;
  if (api?.status !== 400) return null;

  const campos = api.meta?.campos;
  if (!campos) return api.erros?.length ? api.erros : [api.message || "Dados inválidos."];

  const valores = form.getValues();
  const restantes: string[] = [];
  let focar = true;
  for (const [campo, mensagem] of Object.entries(campos)) {
    if (campo !== "_" && get(valores, campo) !== undefined) {
      form.setError(campo as Path<T>, { type: "server", message: mensagem }, { shouldFocus: focar });
      focar = false;
    } else {
      restantes.push(campo === "_" ? mensagem : `${campo}: ${mensagem}`);
    }
  }
  return restantes;
}
