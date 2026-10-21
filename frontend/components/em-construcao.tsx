"use client";

import { Construction } from "lucide-react";

import { PageLayout } from "@/components/page-layout";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * Tela provisória dos módulos do domínio que ainda não têm interface — o item
 * já aparece no menu para acompanhar o andamento. Sai quando a última tela
 * real substituir a sua página.
 */
export function EmConstrucao({ title }: { title: string }) {
  return (
    <PageLayout title={title}>
      <EmptyState
        icon={Construction}
        title="Tela em construção"
        description="Esta funcionalidade já está sendo preparada e aparece aqui em breve."
      />
    </PageLayout>
  );
}
