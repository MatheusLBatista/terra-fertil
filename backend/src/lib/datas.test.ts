import { describe, expect, it } from "vitest";
import { diaSeguinte, inicioDoDia } from "./datas.ts";

describe("inicioDoDia", () => {
  it("devolve a meia-noite UTC do dia informado", () => {
    expect(inicioDoDia("2026-03-10").toISOString()).toBe("2026-03-10T00:00:00.000Z");
  });
});

describe("diaSeguinte", () => {
  it("devolve a meia-noite UTC do dia seguinte", () => {
    expect(diaSeguinte("2026-03-10").toISOString()).toBe("2026-03-11T00:00:00.000Z");
  });

  it("vira o mês e o ano", () => {
    expect(diaSeguinte("2026-01-31").toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(diaSeguinte("2026-12-31").toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("respeita o ano bissexto", () => {
    expect(diaSeguinte("2028-02-28").toISOString()).toBe("2028-02-29T00:00:00.000Z");
    expect(diaSeguinte("2027-02-28").toISOString()).toBe("2027-03-01T00:00:00.000Z");
  });
});
