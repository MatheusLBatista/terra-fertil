import { env } from "../env.ts";
import { AppError } from "../appError.ts";

/**
 * Cliente da Admin API v2 do Garage — gestão de buckets e chaves de acesso.
 * O data plane (upload/download de objetos) usa o cliente S3 em objectsClient.ts.
 */

const BASE_URL = (env.GARAGE_URL ?? "http://localhost:3903").replace(/\/$/, "");
const ADMIN_KEY = env.GARAGE_ADMIN_KEY ?? "";

async function garageRequest<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}/v2/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${ADMIN_KEY}`,
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new AppError(`Garage API: ${res.status} ${text}`.trim(), 502);
  }

  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

type GaragePermissions = { read: boolean; write: boolean; owner: boolean };

export const garageClient = {
  getClusterStatus: () => garageRequest<{ garageVersion: string }>("GET", "GetClusterStatus"),

  getBucketInfo: (id: string) =>
    garageRequest<{ id: string; globalAliases: string[]; objects: number; bytes: number }>(
      "GET",
      `GetBucketInfo?id=${encodeURIComponent(id)}`,
    ),

  createBucket: (globalAlias: string) =>
    garageRequest<{ id: string; globalAliases: string[] }>("POST", "CreateBucket", { globalAlias }),

  deleteBucket: (id: string) => garageRequest<void>("POST", `DeleteBucket?id=${encodeURIComponent(id)}`),

  allowBucketKey: (bucketId: string, accessKeyId: string, permissions: GaragePermissions) =>
    garageRequest<void>("POST", "AllowBucketKey", { bucketId, accessKeyId, permissions }),

  denyBucketKey: (bucketId: string, accessKeyId: string, permissions: GaragePermissions) =>
    garageRequest<void>("POST", "DenyBucketKey", { bucketId, accessKeyId, permissions }),

  createKey: (name: string) =>
    garageRequest<{ accessKeyId: string; secretAccessKey: string; name: string }>("POST", "CreateKey", {
      name,
    }),

  deleteKey: (accessKeyId: string) =>
    garageRequest<void>("POST", `DeleteKey?id=${encodeURIComponent(accessKeyId)}`),
};
