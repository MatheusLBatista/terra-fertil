"use client";

import { useEffect } from "react";

/**
 * Comportamento global: dentro de um <form>, pressionar Enter num <input> pula
 * para o próximo campo (input/textarea/select) em vez de submeter. No último
 * campo, o Enter segue normal (submete). Em <textarea> e botões o Enter é normal
 * (quebra de linha / aciona).
 *
 * Comboboxes/selects do base-ui não são afetados: o input de busca deles é
 * renderizado em portal (fora do <form>), então `input.form` é null e ignoramos.
 */
const TIPOS_IGNORADOS = new Set(["button", "submit", "reset", "checkbox", "radio", "file", "range", "color"]);

function visivel(el: HTMLElement) {
  return el.offsetParent !== null || el.getClientRects().length > 0;
}

export function EnterFieldNavigation() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      // Alguém já tratou o Enter (ex.: combobox selecionando o item destacado).
      if (e.defaultPrevented) return;

      const alvo = e.target as HTMLElement | null;
      // Só intercepta em <input>. Botões e <textarea> mantêm o Enter padrão.
      if (!alvo || alvo.tagName !== "INPUT") return;

      const input = alvo as HTMLInputElement;
      const tipo = (input.type || "text").toLowerCase();
      if (TIPOS_IGNORADOS.has(tipo)) return;
      // Combobox (Seletor) com a lista aberta: o Enter é dele, seleciona o item.
      if (input.getAttribute("aria-expanded") === "true") return;

      // Sem <form> (ex.: busca do combobox portalizado, campos soltos): não mexe.
      const form = input.form;
      if (!form) return;

      const campos = Array.from(form.querySelectorAll<HTMLElement>("input, textarea, select")).filter((f) => {
        const el = f as HTMLInputElement;
        if (el.disabled || el.readOnly) return false;
        if (f.tagName === "INPUT" && TIPOS_IGNORADOS.has((el.type || "text").toLowerCase())) return false;
        return visivel(f);
      });

      const idx = campos.indexOf(input);
      if (idx === -1) return;

      const proximo = campos[idx + 1];
      if (!proximo) return; // último campo: deixa o Enter seguir (submeter)

      e.preventDefault();
      proximo.focus();
      const p = proximo as HTMLInputElement | HTMLTextAreaElement;
      if (p.tagName === "INPUT" && typeof p.select === "function") {
        try {
          p.select();
        } catch {
          /* alguns tipos (date/number) não suportam select */
        }
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  return null;
}
