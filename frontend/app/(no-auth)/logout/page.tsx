"use client";

import { useEffect } from "react";
import { authClient } from "@/lib/auth-client";
import Loading from "@/components/Loading";
import { destinoInterno } from "@/lib/app";

// Destino do redirecionamento de sessão expirada (ver lib/fetchData.ts e
// app/(auth)/layout.tsx): encerra a sessão e repassa `next`/`motivo` ao login.
export default function LogoutPage() {
  useEffect(() => {
    (async () => {
      try {
        await authClient.signOut();
      } finally {
        const params = new URLSearchParams(window.location.search);
        const login = new URLSearchParams();
        const next = destinoInterno(params.get("next"));
        if (next) login.set("next", next);
        if (params.get("motivo") === "expirada") login.set("motivo", "expirada");
        const query = login.toString();
        // Reload completo de propósito: descarta o estado da sessão antiga.
        window.location.href = query ? `/login?${query}` : "/login";
      }
    })();
  }, []);

  return <Loading />;
}
