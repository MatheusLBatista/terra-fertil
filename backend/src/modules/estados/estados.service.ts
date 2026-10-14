import EstadosRepository from "./estados.repository.ts";

export default class EstadosService {
  private repository = new EstadosRepository();

  async listar() {
    return this.repository.listar();
  }
}
