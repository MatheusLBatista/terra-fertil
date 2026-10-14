import type { Context } from "hono";
import { Readable } from "node:stream";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, bucketName } from "./objectsClient.ts";
import { AppError } from "../appError.ts";
import logger from "../logger.ts";
import { env } from "../env.ts";

const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const DOC_MIME_TYPES = [...IMAGE_MIME_TYPES, "application/pdf"];
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB

/**
 * Arquivo recebido no multipart, no formato que os services consomem.
 * O controller repassa isto; a política de pasta/nome é decidida no service.
 */
export type ArquivoUpload = {
  originalname: string;
  buffer: Buffer;
  mimetype: string;
};

type OpcoesUpload = {
  /** Nome do campo no multipart (default "arquivo"). */
  campo?: string;
  /** Tipos MIME aceitos. */
  tipos?: string[];
  /** Tamanho máximo em bytes (default 20 MB). */
  maxBytes?: number;
  /** Mensagem do 415 quando o tipo não é aceito. */
  mensagemTipo?: string;
};

/**
 * Lê UM arquivo do multipart da requisição (Hono `parseBody`) e valida tipo e
 * tamanho. Lança `AppError` 400/413/415 — o errorHandler converte no envelope.
 *
 *   const arquivo = await lerArquivo(c);                 // imagem, campo "arquivo"
 *   const doc = await lerDocumento(c, { campo: "pdf" }); // imagem ou PDF
 *
 * Na rota, limite o corpo antes de ler: `bodyLimit({ maxSize: MAX_UPLOAD_BYTES })`
 * (hono/body-limit) — senão um upload gigante é lido inteiro na memória.
 */
export async function lerArquivo(c: Context, opcoes: OpcoesUpload = {}): Promise<ArquivoUpload> {
  const {
    campo = "arquivo",
    tipos = IMAGE_MIME_TYPES,
    maxBytes = MAX_UPLOAD_BYTES,
    mensagemTipo = "Tipo de arquivo não permitido. Use JPEG, PNG, WebP ou GIF.",
  } = opcoes;

  const contentType = c.req.header("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    throw new AppError("Envie o arquivo como multipart/form-data", 400);
  }

  const body = await c.req.parseBody();
  const valor = body[campo];
  if (!(valor instanceof File)) {
    throw new AppError(`Arquivo ausente no campo "${campo}"`, 400);
  }
  if (!tipos.includes(valor.type)) {
    throw new AppError(mensagemTipo, 415);
  }
  if (valor.size > maxBytes) {
    throw new AppError(`Arquivo muito grande. Tamanho máximo: ${Math.round(maxBytes / 1024 / 1024)} MB`, 413);
  }

  return {
    originalname: valor.name,
    mimetype: valor.type,
    buffer: Buffer.from(await valor.arrayBuffer()),
  };
}

/** Variante para documentos (imagens + PDF). */
export const lerDocumento = (c: Context, opcoes: OpcoesUpload = {}) =>
  lerArquivo(c, {
    tipos: DOC_MIME_TYPES,
    mensagemTipo: "Tipo de arquivo não permitido. Use PDF ou imagem (JPEG, PNG, WebP, GIF).",
    ...opcoes,
  });

/** Faz upload de um buffer para o Garage e retorna a URL pública do objeto. */
export async function uploadToS3(
  folder: string,
  filename: string,
  buffer: Buffer,
  contentType: string,
  abortSignal?: AbortSignal,
): Promise<string> {
  const key = `${folder}/${filename}`;

  try {
    await s3Client.send(
      new PutObjectCommand({ Bucket: bucketName, Key: key, Body: buffer, ContentType: contentType }),
      { abortSignal },
    );
  } catch (err: unknown) {
    const s3Err = err as { name?: string; message?: string };
    logger.error(
      { bucket: bucketName, key, contentType, s3Error: s3Err.name, s3Message: s3Err.message },
      "Erro no upload S3",
    );
    throw new AppError("Falha ao enviar arquivo para o storage", 502);
  }

  const publicUrl = env.OBJECTS_PUBLIC_URL ?? `${env.OBJECTS_ENDPOINT}/${bucketName}`;
  return `${publicUrl}/${key}`;
}

/**
 * Baixa um objeto do Garage para servir via API (download com autorização).
 * O cliente nunca fala com o bucket direto — a API é o proxy.
 */
export async function downloadFromS3(
  key: string,
): Promise<{ body: NodeJS.ReadableStream; contentType?: string }> {
  try {
    const res = await s3Client.send(new GetObjectCommand({ Bucket: bucketName, Key: key }));
    return { body: res.Body as NodeJS.ReadableStream, contentType: res.ContentType };
  } catch {
    throw new AppError("Arquivo não encontrado no storage", 404);
  }
}

/**
 * Resposta HTTP que repassa o objeto do storage em streaming (sem carregar na
 * memória). Uso no controller:
 *
 *   const obj = await downloadFromS3(key);
 *   return respostaDeStream(obj, { cacheControl: "private, max-age=86400" });
 */
export function respostaDeStream(
  obj: { body: NodeJS.ReadableStream; contentType?: string },
  opcoes: { cacheControl?: string; nomeArquivo?: string } = {},
): Response {
  const headers = new Headers({ "Content-Type": obj.contentType ?? "application/octet-stream" });
  if (opcoes.cacheControl) headers.set("Cache-Control", opcoes.cacheControl);
  if (opcoes.nomeArquivo) headers.set("Content-Disposition", `attachment; filename="${opcoes.nomeArquivo}"`);
  const web = Readable.toWeb(obj.body as Readable) as ReadableStream;
  return new Response(web, { headers });
}

/**
 * Política de nomenclatura dos objetos: `<prefixo>-<timestamp>[-<sufixo>].<ext>`.
 * Centralizada aqui para que todos os módulos gerem chaves no mesmo formato.
 */
export function nomeArquivo(prefixo: string, originalname: string, extPadrao = "bin"): string {
  const ext = originalname.split(".").pop() || extPadrao;
  return `${prefixo}-${Date.now()}.${ext}`;
}

/** Variante para lotes (vários arquivos no mesmo milissegundo) — acrescenta sufixo aleatório. */
export function nomeArquivoLote(prefixo: string, originalname: string, extPadrao = "bin"): string {
  const ext = originalname.split(".").pop() || extPadrao;
  return `${prefixo}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
}
