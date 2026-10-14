import { ImageResponse } from "next/og";
import { MARCA_BLOCOS, MARCA_CORES_ICONE, MARCA_FAISCA, MARCA_VIEWBOX } from "@/lib/marca";

// Ícone para iOS/Android (180x180 PNG gerado no build) — mesma marca de lib/marca.ts.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", background: MARCA_CORES_ICONE.fundo }}>
      <svg width="180" height="180" viewBox={MARCA_VIEWBOX}>
        {MARCA_BLOCOS.map((b) => (
          <rect
            key={`${b.x}-${b.y}`}
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            rx={b.r}
            fill={MARCA_CORES_ICONE.bloco}
          />
        ))}
        <path d={MARCA_FAISCA} fill={MARCA_CORES_ICONE.faisca} />
      </svg>
    </div>,
    size,
  );
}
