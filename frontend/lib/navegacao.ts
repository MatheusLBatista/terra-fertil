import { House, Map, MapPin, ScrollText, ShieldCheck, Users, type LucideIcon } from "lucide-react";

import type { Papel } from "@/lib/papeis";

export type NavItem = {
  title: string;
  url: string;
  /** Papel mínimo para o item aparecer — o backend continua sendo a autoridade. */
  minimo: Papel;
  icon: LucideIcon;
};

export type NavGroup = {
  label?: string;
  items: NavItem[];
};

/**
 * Menu lateral. Módulo novo entra aqui (e ganha a permissão do Subject no seed
 * de papéis do backend). Fica fora do componente para o breadcrumb e outras
 * telas poderem consultar a estrutura sem importar o sidebar.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    items: [{ title: "Dashboard", url: "/dashboard", minimo: "usuario", icon: House }],
  },
  {
    label: "Cadastros",
    items: [
      { title: "Municípios", url: "/municipios", minimo: "usuario", icon: MapPin },
      { title: "Estados", url: "/estados", minimo: "usuario", icon: Map },
    ],
  },
  {
    label: "Administração",
    items: [
      // GET /historico exige `read HistoricoAlteracao` — admin e gestor no seed.
      { title: "Histórico", url: "/historico", minimo: "gestor", icon: ScrollText },
      { title: "Usuários", url: "/usuarios", minimo: "admin", icon: Users },
      // CRUD de papéis/permissões (tabelas papeis/permissoes do backend)
      { title: "Papéis", url: "/papeis", minimo: "admin", icon: ShieldCheck },
    ],
  },
];

/** Todos os itens, sem os grupos. */
export const NAV_ITENS: NavItem[] = NAV_GROUPS.flatMap((grupo) => grupo.items);

/** A URL (pathname) pertence ao item? Vale para a tela e suas sub-rotas. */
export function itemAtivo(item: NavItem, url: string) {
  return url === item.url || url.startsWith(item.url + "/");
}

/** Grupo do menu ao qual a tela pertence — `undefined` para rotas fora do menu. */
export function grupoDaTela(url: string): NavGroup | undefined {
  return NAV_GROUPS.find((grupo) => grupo.items.some((item) => itemAtivo(item, url)));
}
