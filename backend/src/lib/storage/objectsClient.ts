import { S3Client } from "@aws-sdk/client-s3";
import { Agent as AgenteHttp } from "node:http";
import { Agent as AgenteHttps } from "node:https";
import { env } from "../env.ts";

/**
 * Cliente S3 apontando para o Garage (S3-compatível).
 * `forcePathStyle` + checksums `WHEN_REQUIRED` são exigências do Garage.
 *
 * Timeouts e keep-alive desligado: o Garage fecha o socket sem avisar e a
 * próxima request escreveria num socket morto, ficando pendurada para sempre
 * (o SDK não tem timeout por padrão). `throwOnRequestTimeout` faz o timeout
 * virar erro em vez de só logar.
 */
const S3_CLIENT_BASE = {
  region: env.OBJECTS_REGION,
  endpoint: env.OBJECTS_ENDPOINT,
  forcePathStyle: true,
  requestChecksumCalculation: "WHEN_REQUIRED" as const,
  responseChecksumValidation: "WHEN_REQUIRED" as const,
  requestHandler: {
    httpAgent: new AgenteHttp({ keepAlive: false }),
    httpsAgent: new AgenteHttps({ keepAlive: false }),
    connectionTimeout: 5_000,
    requestTimeout: 20_000,
    throwOnRequestTimeout: true,
  },
};

export const s3Client = new S3Client({
  ...S3_CLIENT_BASE,
  credentials: {
    accessKeyId: env.OBJECTS_ACCESS_KEY_ID ?? "",
    secretAccessKey: env.OBJECTS_SECRET_ACCESS_KEY ?? "",
  },
});

/** Cliente com credenciais próprias (ex.: chave por tenant criada via Admin API). */
export function createS3Client(accessKeyId: string, secretAccessKey: string) {
  return new S3Client({
    ...S3_CLIENT_BASE,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export const bucketName = env.OBJECTS_BUCKET_NAME ?? "";
