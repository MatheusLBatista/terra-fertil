import { randomUUID } from "node:crypto";
import { AppError } from "../appError.ts";
import { getLogger } from "../logger.ts";
import { env } from "../env.ts";
import { ehEmailTecnico } from "../documentos.ts";

/**
 * Cliente do FS-Mail — envio de e-mail transacional via POST na API REST.
 *
 * Contrato: `POST {FSMAIL_URL}/v1/emails` com `Authorization: Bearer <API key>`.
 * A API valida e responde 202 com `{ email_id }`; o envio real é do worker do
 * FS-Mail. Timeout de 10s por tentativa e UMA repetição em falha de rede/5xx,
 * com a mesma `Idempotency-Key` — o FS-Mail não duplica o e-mail.
 *
 * Sem `FSMAIL_API_KEY` configurada (dev), o envio é apenas logado.
 * Endereços técnicos (`@sem-email.invalid`, de quem não tem e-mail) são
 * descartados; se não sobrar destinatário, nada é enviado.
 */

const TIMEOUT_MS = 10_000;

export interface EmailPayload {
  to: string | string[];
  subject?: string;
  html?: string;
  text?: string;
  /** Template mantido no painel do FS-Mail — substitui subject/html/text. */
  templateId?: string;
  variables?: Record<string, string>;
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  /** Chave de idempotência; gerada automaticamente quando omitida. */
  idempotencyKey?: string;
}

export async function sendEmail(payload: EmailPayload): Promise<{ emailId: string | null }> {
  const logger = getLogger();
  const apiKey = env.FSMAIL_API_KEY;
  const baseUrl = (env.FSMAIL_URL ?? "").replace(/\/$/, "");
  const from = env.FSMAIL_FROM;

  const destinatarios = (Array.isArray(payload.to) ? payload.to : [payload.to]).filter(
    (email) => !ehEmailTecnico(email),
  );
  if (destinatarios.length === 0) {
    logger.info({ to: payload.to }, "[fsmail] só destinatários sem e-mail real — nada enviado");
    return { emailId: null };
  }

  if (!apiKey || !baseUrl) {
    logger.info(
      { to: payload.to, subject: payload.subject },
      "[fsmail] FSMAIL_API_KEY ausente — e-mail apenas logado (modo dev)",
    );
    return { emailId: null };
  }

  const body: Record<string, unknown> = {
    from,
    to: destinatarios,
    ...(payload.cc ? { cc: payload.cc } : {}),
    ...(payload.bcc ? { bcc: payload.bcc } : {}),
    ...(payload.replyTo ? { reply_to: payload.replyTo } : {}),
    ...(payload.templateId
      ? { template_id: payload.templateId, variables: payload.variables ?? {} }
      : {
          subject: payload.subject,
          ...(payload.html ? { html: payload.html } : {}),
          ...(payload.text ? { text: payload.text } : {}),
        }),
  };
  const idempotencyKey = payload.idempotencyKey ?? randomUUID();

  const enviar = () =>
    fetch(`${baseUrl}/v1/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

  let res: Response;
  try {
    res = await enviar();
    if (res.status >= 500) throw new Error(`FS-Mail respondeu ${res.status}`);
  } catch (err) {
    logger.warn({ err, idempotencyKey }, "[fsmail] Falha na primeira tentativa — repetindo");
    try {
      res = await enviar();
    } catch (err2) {
      logger.error({ err: err2, idempotencyKey }, "[fsmail] Falha no envio (2 tentativas)");
      throw new AppError("FS-Mail indisponível", 502);
    }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    logger.error({ status: res.status, body: text, idempotencyKey }, "[fsmail] Falha no envio");
    throw new AppError(`FS-Mail: ${res.status} ${text}`.trim(), 502);
  }

  const data = (await res.json().catch(() => ({}))) as { email_id?: string };
  logger.info({ emailId: data.email_id, to: payload.to }, "[fsmail] E-mail aceito para envio");
  return { emailId: data.email_id ?? null };
}
