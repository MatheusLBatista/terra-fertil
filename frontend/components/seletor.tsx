"use client";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";

export type OpcaoSeletor = { value: string; label: string };

interface SeletorProps {
  id?: string;
  opcoes: OpcaoSeletor[];
  /** Valor selecionado (`value` da opção) ou vazio/null para nenhum. */
  valor: string | null | undefined;
  onValorChange: (valor: string | null) => void;
  placeholder?: string;
  /** Texto quando a busca não encontra nada. */
  vazio?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

/**
 * Seleção única com busca, por cima do `Combobox` (base-ui) do template. A tela
 * fala em `string | null`; a conversão para o objeto da opção fica aqui.
 *
 * O input de busca é renderizado no próprio lugar (não em portal), então
 * dentro de um `<form>` o EnterFieldNavigation o enxerga como um campo comum —
 * com a lista aberta, o Enter é do combobox (seleciona); fechada, pula adiante.
 */
export function Seletor({
  id,
  opcoes,
  valor,
  onValorChange,
  placeholder = "Selecione…",
  vazio = "Nenhuma opção encontrada.",
  disabled,
  className,
  "aria-label": ariaLabel,
}: SeletorProps) {
  const selecionada = valor ? (opcoes.find((o) => o.value === valor) ?? null) : null;

  return (
    <Combobox
      items={opcoes}
      value={selecionada}
      onValueChange={(opcao) => onValorChange(opcao?.value ?? null)}
      itemToStringLabel={(opcao: OpcaoSeletor) => opcao.label}
      isItemEqualToValue={(a: OpcaoSeletor, b: OpcaoSeletor) => a.value === b.value}
      disabled={disabled}
    >
      <ComboboxInput
        id={id}
        aria-label={ariaLabel}
        placeholder={placeholder}
        disabled={disabled}
        showClear={!!selecionada}
        className={className}
      />
      <ComboboxContent>
        <ComboboxEmpty>{vazio}</ComboboxEmpty>
        <ComboboxList>
          {(opcao: OpcaoSeletor) => (
            <ComboboxItem key={opcao.value} value={opcao}>
              {opcao.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
