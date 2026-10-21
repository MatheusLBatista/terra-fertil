import { describe, expect, it } from "vitest";
import {
  cnpjValido,
  cpfValido,
  ehEmailTecnico,
  emailTecnico,
  normalizarTelefone,
  somenteDigitos,
} from "./documentos.ts";

describe("somenteDigitos", () => {
  it("remove máscara", () => {
    expect(somenteDigitos("07.638.987/0001-13")).toBe("07638987000113");
  });
});

describe("cnpjValido", () => {
  it("aceita CNPJ com dígitos corretos, com ou sem máscara", () => {
    expect(cnpjValido("07.638.987/0001-13")).toBe(true);
    expect(cnpjValido("38101237000131")).toBe(true);
  });

  it("recusa dígito errado, tamanho errado e sequência repetida", () => {
    expect(cnpjValido("07638987000114")).toBe(false);
    expect(cnpjValido("91.34307/0001-50")).toBe(false);
    expect(cnpjValido("11111111111111")).toBe(false);
  });
});

describe("cpfValido", () => {
  it("aceita CPF válido", () => {
    expect(cpfValido("529.982.247-25")).toBe(true);
  });

  it("recusa dígito errado e sequência repetida", () => {
    expect(cpfValido("52998224726")).toBe(false);
    expect(cpfValido("00000000000")).toBe(false);
    expect(cpfValido("123")).toBe(false);
  });
});

describe("normalizarTelefone", () => {
  it("normaliza os formatos da planilha para E.164 sem +", () => {
    expect(normalizarTelefone("069993453103")).toBe("5569993453103");
    expect(normalizarTelefone("55069993607005")).toBe("5569993607005");
    expect(normalizarTelefone("(69) 99345-3103")).toBe("5569993453103");
    expect(normalizarTelefone("6932221234")).toBe("556932221234");
  });

  it("devolve undefined quando não é um telefone", () => {
    expect(normalizarTelefone("123")).toBeUndefined();
  });
});

describe("e-mail técnico", () => {
  it("monta e reconhece o domínio reservado", () => {
    expect(emailTecnico("5569993453103")).toBe("5569993453103@sem-email.invalid");
    expect(ehEmailTecnico("5569993453103@sem-email.invalid")).toBe(true);
    expect(ehEmailTecnico("ana@example.com")).toBe(false);
  });
});
