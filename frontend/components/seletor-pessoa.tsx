"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { fetchData } from "@/lib/fetchData";
import { telefone } from "@/lib/formato";
import type { Envelope } from "@/types/envelope";
import type { components } from "@/types/api";

export type Pessoa = components["schemas"]["Pessoa"];

interface SeletorPessoaProps {
  id?: string;
  valor: Pessoa | null;
  onValorChange: (pessoa: Pessoa | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

const rotulo = (p: Pessoa) =>
  [p.nome, p.email ?? (p.telefone ? telefone(p.telefone) : null)].filter(Boolean).join(" · ");

/**
 * Escolha de uma pessoa já cadastrada (produtor, contato, membro de equipe) com
 * busca no servidor (`GET /pessoas?busca=`), a partir de 2 letras. A tela
 * guarda o objeto `Pessoa` (para mostrar o nome mesmo fora do resultado atual).
 * Cadastrar uma pessoa nova é decisão do formulário que usa este campo.
 */
export function SeletorPessoa({
  id,
  valor,
  onValorChange,
  placeholder = "Buscar por nome, e-mail ou telefone…",
  disabled,
  className,
  ...aria
}: SeletorPessoaProps) {
  const [texto, setTexto] = useState("");
  const [termo, setTermo] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setTermo(texto.trim()), 300);
    return () => clearTimeout(t);
  }, [texto]);

  const pessoas = useQuery({
    queryKey: ["pessoas", { busca: termo }],
    queryFn: ({ signal }) => fetchData<Envelope<Pessoa[]>>("/pessoas", { query: { busca: termo }, signal }),
    enabled: termo.length >= 2,
  });
  const itens = pessoas.data?.data ?? [];

  return (
    <Combobox
      items={itens}
      value={valor}
      // A busca é do servidor: o combobox não filtra de novo no cliente.
      filter={null}
      onInputValueChange={(v) => setTexto(v)}
      onValueChange={(p) => onValorChange(p ?? null)}
      itemToStringLabel={(p: Pessoa) => p.nome}
      isItemEqualToValue={(a: Pessoa, b: Pessoa) => a.id === b.id}
      disabled={disabled}
    >
      <ComboboxInput
        id={id}
        placeholder={placeholder}
        disabled={disabled}
        showClear={!!valor}
        className={className}
        {...aria}
      />
      <ComboboxContent>
        <ComboboxEmpty>
          {termo.length < 2
            ? "Digite pelo menos 2 letras."
            : pessoas.isPending
              ? "Buscando…"
              : "Ninguém encontrado."}
        </ComboboxEmpty>
        <ComboboxList>
          {(p: Pessoa) => (
            <ComboboxItem key={p.id} value={p}>
              {rotulo(p)}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
