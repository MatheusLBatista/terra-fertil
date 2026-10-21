import {
  ClipboardList,
  FileCheck,
  FileText,
  FlaskConical,
  FolderKanban,
  GraduationCap,
  Handshake,
  House,
  ListChecks,
  ListTree,
  Map,
  MapPin,
  Package,
  ScrollText,
  ShieldCheck,
  ShoppingCart,
  Sprout,
  Target,
  Truck,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

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
  // Domínio Terra Fértil — o técnico (papel fora da régua) conta como "usuario";
  // o que ele vê de cada tela é decidido pelo backend (permissão + projetos da equipe).
  {
    label: "Projeto",
    items: [
      { title: "Projetos", url: "/projetos", minimo: "usuario", icon: FolderKanban },
      { title: "Metas", url: "/metas", minimo: "usuario", icon: Target },
      { title: "Produções técnicas", url: "/producoes", minimo: "usuario", icon: FileText },
      { title: "Lançamentos financeiros", url: "/lancamentos", minimo: "gestor", icon: Wallet },
    ],
  },
  {
    label: "Associações e produtores",
    items: [
      { title: "Associações", url: "/associacoes", minimo: "usuario", icon: Handshake },
      { title: "Produtores", url: "/produtores", minimo: "usuario", icon: UserRound },
      { title: "Propriedades", url: "/propriedades", minimo: "usuario", icon: Sprout },
    ],
  },
  {
    label: "Campo",
    items: [
      { title: "Visitas", url: "/visitas", minimo: "usuario", icon: ClipboardList },
      { title: "Recomendações", url: "/recomendacoes", minimo: "usuario", icon: ListChecks },
      { title: "Análises de solo", url: "/analises-solo", minimo: "usuario", icon: FlaskConical },
    ],
  },
  {
    label: "Equipamentos",
    items: [
      { title: "Entregas", url: "/entregas", minimo: "usuario", icon: Truck },
      { title: "Pedidos de compra", url: "/pedidos-compra", minimo: "usuario", icon: ShoppingCart },
      { title: "Itens", url: "/itens", minimo: "gestor", icon: Package },
    ],
  },
  {
    label: "Capacitação",
    items: [{ title: "Eventos", url: "/eventos", minimo: "usuario", icon: GraduationCap }],
  },
  {
    label: "Cadastros",
    items: [
      { title: "Tipos de documento", url: "/tipos-documento", minimo: "gestor", icon: FileCheck },
      { title: "Opções de diagnóstico", url: "/opcoes-diagnostico", minimo: "gestor", icon: ListTree },
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
