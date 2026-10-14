import { describe, expect, it } from "vitest";
import { deCentavos, formatarCentavos, paraCentavos } from "./dinheiro.ts";

describe("paraCentavos", () => {
  it("converte número decimal em centavos inteiros", () => {
    expect(paraCentavos(12.5)).toBe(1250);
    expect(paraCentavos(0)).toBe(0);
    expect(paraCentavos(-3.1)).toBe(-310);
  });

  it("não perde centavo por imprecisão de float", () => {
    expect(paraCentavos(1.005)).toBe(101);
    expect(paraCentavos(0.1 + 0.2)).toBe(30);
  });

  it("aceita texto em pt-BR e em en", () => {
    expect(paraCentavos("1.234,56")).toBe(123456);
    expect(paraCentavos("R$ 10,00")).toBe(1000);
    expect(paraCentavos("1234.56")).toBe(123456);
    expect(paraCentavos("7")).toBe(700);
  });

  it("lança em entrada inválida", () => {
    expect(() => paraCentavos("abc")).toThrow(TypeError);
    expect(() => paraCentavos(Number.NaN)).toThrow(TypeError);
  });
});

describe("deCentavos / formatarCentavos", () => {
  it("volta para decimal", () => {
    expect(deCentavos(1250)).toBe(12.5);
  });

  it("formata em real brasileiro", () => {
    // Intl usa espaço não separável entre "R$" e o número
    expect(formatarCentavos(123456).replace(/\u00a0/g, " ")).toBe("R$ 1.234,56");
    expect(formatarCentavos(-50).replace(/\u00a0/g, " ")).toBe("-R$ 0,50");
  });
});
