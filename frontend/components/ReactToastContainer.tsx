"use client";

import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useTheme } from "next-themes";
import { AMBIENTE_PILL_VISIVEL } from "@/components/ambiente-pill";

export default function ReactToastContainer() {
  const { resolvedTheme } = useTheme();
  // Com a pílula de ambiente no canto, os toasts descem para não ficar embaixo dela.
  return (
    <ToastContainer
      closeOnClick
      theme={resolvedTheme === "light" ? "light" : "dark"}
      style={AMBIENTE_PILL_VISIVEL ? { top: "3.75rem" } : undefined}
    />
  );
}
