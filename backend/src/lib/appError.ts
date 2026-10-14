/**
 * Erro de negócio/HTTP: o `errorHandler` converte no envelope com o status.
 * `codigo` (opcional) é um identificador estável para o cliente tratar por
 * código em vez de comparar mensagem (ex.: "PAPEL_EM_USO") — vai em `meta.codigo`.
 */
export class AppError extends Error {
  statusCode: number;
  data?: unknown;
  codigo?: string;

  constructor(message: string, statusCode = 400, data?: unknown, codigo?: string) {
    super(message);
    this.statusCode = statusCode;
    this.data = data;
    this.codigo = codigo;
  }
}
