import { redirect } from "next/navigation";

// Sem página pública: o produto é interno. Quem chega na raiz é despachado
// pelo `proxy.ts` (cookie de sessão → /dashboard, senão → /login); este
// redirect é só o fallback caso a raiz seja servida sem passar pelo proxy.
export default function Home() {
  redirect("/login");
}
