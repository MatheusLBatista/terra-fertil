/**
 * Marca da aplicação — fonte única do desenho usado por `components/logo.tsx`
 * (menu lateral, telas de login) e `app/apple-icon.tsx`. Trocar a marca é
 * editar este arquivo e o `app/icon.svg` (estático, mesmo desenho — o Next
 * não gera o favicon a partir daqui).
 *
 * Tudo em `viewBox="0 0 64 64"`.
 */
export const MARCA_VIEWBOX = "0 0 64 64";

/** Os três blocos (retângulos arredondados) — `x y largura altura raio`. */
export const MARCA_BLOCOS = [
  { x: 12, y: 12, w: 18, h: 18, r: 5 },
  { x: 12, y: 34, w: 18, h: 18, r: 5 },
  { x: 34, y: 34, w: 18, h: 18, r: 5 },
] as const;

/** A "faísca" no canto superior direito. */
export const MARCA_FAISCA =
  "M43 12c1.2 5.2 3.8 7.8 9 9-5.2 1.2-7.8 3.8-9 9-1.2-5.2-3.8-7.8-9-9 5.2-1.2 7.8-3.8 9-9z";

/** Raio do fundo quando a marca aparece como ícone (aba, iOS). */
export const MARCA_RAIO_FUNDO = 14;

/**
 * Cores FIXAS para os ícones gerados fora do CSS (`apple-icon.tsx`, `icon.svg`).
 * No painel o `Logo` usa as variáveis do tema (`--sidebar`, `--primary`).
 */
export const MARCA_CORES_ICONE = {
  fundo: "#18181b",
  bloco: "#3b82f6",
  faisca: "#bfdbfe",
} as const;
