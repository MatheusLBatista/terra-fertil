import pino from "pino";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { Writable } from "node:stream";
import { env } from "./env.ts";
import { getContext } from "./requestContext.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logDir = path.join(__dirname, "../../logs");

const logLevel = env.LOG_LEVEL;
const isDev = env.NODE_ENV !== "production";
// Arquivo em logs/: sempre em dev; em produção só com LOG_FILE=true (o padrão
// é stdout puro, para o docker/orquestrador coletar).
const gravarArquivo = isDev || env.LOG_FILE;

/** Flushes pendentes do OpenObserve — `flushLogs()` os espera antes de sair. */
const flushers: (() => Promise<void>)[] = [];

/**
 * Stream que envia os logs para o OpenObserve em lotes.
 *
 * Ativa apenas com OPENOBSERVE_URL e OPENOBSERVE_TOKEN definidos no .env.
 * Endpoint: POST {OPENOBSERVE_URL}/api/{org}/{stream}/_json
 * O token vai no header Authorization (prefixo "Basic " adicionado quando o
 * valor não traz o esquema — o OpenObserve usa Basic com base64(email:senha)).
 *
 * Falha de rede nunca derruba a aplicação: o lote é descartado e o erro
 * registrado no stderr.
 */
function createOpenObserveStream(streamName: string): Writable | null {
  const url = env.OPENOBSERVE_URL?.replace(/\/$/, "");
  const token = env.OPENOBSERVE_TOKEN;
  if (!url || !token) return null;

  const org = env.OPENOBSERVE_ORG;
  const endpoint = `${url}/api/${org}/${streamName}/_json`;
  const authorization = /^(basic|bearer) /i.test(token) ? token : `Basic ${token}`;

  const MAX_BATCH = 100;
  const FLUSH_MS = 5_000;
  let batch: string[] = [];
  let timer: NodeJS.Timeout | null = null;

  async function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (batch.length === 0) return;
    const body = `[${batch.join(",")}]`;
    batch = [];
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: authorization, "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        console.error(`[openobserve] envio falhou: ${res.status} ${await res.text().catch(() => "")}`);
      }
    } catch (err) {
      console.error("[openobserve] envio falhou:", err);
    }
  }
  flushers.push(flush);

  return new Writable({
    write(chunk: Buffer, _enc, cb) {
      const line = chunk.toString().trim();
      if (line) batch.push(line);
      if (batch.length >= MAX_BATCH) {
        void flush();
      } else if (!timer) {
        // unref: não impede scripts (seeds, export) de encerrarem o processo
        timer = setTimeout(() => void flush(), FLUSH_MS);
        timer.unref();
      }
      cb();
    },
    final(cb) {
      void flush().finally(cb);
    },
  });
}

/** Envia os lotes pendentes ao OpenObserve — chame no shutdown (server.ts). */
export async function flushLogs(): Promise<void> {
  await Promise.all(flushers.map((f) => f()));
}

export function createLogger(filename: string) {
  const streams: pino.StreamEntry[] = [];

  if (gravarArquivo) {
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    streams.push({
      level: logLevel as pino.Level,
      // sync: escrita direta no fd — permite process.exit em scripts sem perder logs
      stream: pino.destination({ dest: path.join(logDir, `${filename}.log`), sync: true }),
    });
  }

  if (isDev) {
    streams.push({
      level: logLevel as pino.Level,
      stream: pino.transport({
        target: "pino-pretty",
        options: { colorize: true, translateTime: "yyyy-mm-dd HH:MM:ss", ignore: "pid,hostname" },
      }),
    });
  } else {
    streams.push({ level: logLevel as pino.Level, stream: process.stdout });
  }

  const openObserve = createOpenObserveStream(filename);
  if (openObserve) {
    streams.push({ level: logLevel as pino.Level, stream: openObserve });
  }

  return pino(
    {
      level: logLevel,
      // Nunca logar credenciais — cookies/Authorization das requests e senhas de payloads
      redact: {
        paths: ["req.headers.cookie", "req.headers.authorization", "password", "*.password", "params"],
        censor: "[redigido]",
      },
      serializers: {
        err: pino.stdSerializers.err,
        req: pino.stdSerializers.req,
        res: pino.stdSerializers.res,
      },
    },
    pino.multistream(streams),
  );
}

const logger = createLogger("app");

/**
 * Logger da requisição atual: um child com `{ requestId, userId }` lidos do
 * AsyncLocalStorage — use nos services/libs em vez do `logger` cru para os
 * logs saírem correlacionados. Fora de uma requisição (scripts) devolve o base.
 */
export function getLogger(): pino.Logger {
  const ctx = getContext();
  if (!ctx?.requestId && !ctx?.userId) return logger;
  return logger.child({ requestId: ctx.requestId, userId: ctx.userId });
}

export default logger;
