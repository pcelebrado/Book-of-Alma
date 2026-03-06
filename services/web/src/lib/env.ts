/**
 * Environment configuration helper.
 * Environment config parity layer.
 *
 * Reads environment variables with safe defaults for local development.
 * Never exposes secret values to the client bundle — all access is server-side only.
 *
 * Parity contract: every variable here must have a corresponding entry in
 * .env.example for the full variable list.
 */

/** MongoDB connection string (server-side only). */
export function getMongoUri(): string {
  return process.env.MONGODB_URI ?? '';
}

/** Internal core service base URL (server-side only). */
export function getCoreBaseUrl(): string {
  return process.env.INTERNAL_CORE_BASE_URL ?? '';
}

/** Public core URL used for cold-start wake probes (server-side only). */
export function getCorePublicUrl(): string {
  const direct = process.env.CORE_PUBLIC_URL?.trim();
  if (direct) {
    return direct;
  }

  const railwayHost = process.env.RAILWAY_SERVICE_OPENCLAW_CORE_URL?.trim();
  if (!railwayHost) {
    return '';
  }

  if (/^https?:\/\//i.test(railwayHost)) {
    return railwayHost;
  }

  return `https://${railwayHost}`;
}

/** Internal service-to-service auth token (server-side only). */
export function getServiceToken(): string {
  return process.env.INTERNAL_SERVICE_TOKEN ?? '';
}

export interface JwtSigningKey {
  kid: string;
  secret: string;
  active: boolean;
}

/** Auth.js/NextAuth secret (server-side only). */
export function getAuthSecret(): string {
  return process.env.AUTH_SECRET ?? '';
}

/** JWT signing keys for internal service auth (server-side only). */
export function getJwtSigningKeys(): JwtSigningKey[] {
  const keySet = process.env.INTERNAL_JWT_SIGNING_KEYS;

  if (keySet) {
    try {
      const parsed = JSON.parse(keySet) as Array<Partial<JwtSigningKey>>;

      return parsed
        .filter((item) => Boolean(item.kid) && Boolean(item.secret))
        .map((item) => ({
          kid: item.kid as string,
          secret: item.secret as string,
          active: item.active === true,
        }));
    } catch {
      return [];
    }
  }

  const singleKey = process.env.INTERNAL_JWT_SIGNING_KEY;
  if (!singleKey) {
    return [];
  }

  return [
    {
      kid: 'k1',
      secret: singleKey,
      active: true,
    },
  ];
}

/** Book content configuration (safe to read on server). */
export function getBookConfig() {
  return {
    sourceMode: process.env.BOOK_SOURCE_MODE ?? 'external',
    sourceDir: process.env.BOOK_SOURCE_DIR ?? '/data/book-source',
    importManifest:
      process.env.BOOK_IMPORT_MANIFEST ?? '/data/book-source/manifest.json',
    canonicalCollection:
      process.env.BOOK_CANONICAL_COLLECTION ?? 'book_sections',
    tocCollection: process.env.BOOK_TOC_COLLECTION ?? 'book_toc',
    importEnabled: process.env.BOOK_IMPORT_ENABLED === 'true',
    importDryRun: process.env.BOOK_IMPORT_DRY_RUN !== 'false',
  } as const;
}

/**
 * Quick readiness check for server components.
 * Returns which dependencies are configured (not connected — just configured).
 */
export function getConfigStatus() {
  return {
    mongo: Boolean(process.env.MONGODB_URI),
    core: Boolean(process.env.INTERNAL_CORE_BASE_URL),
    serviceAuth: Boolean(
      process.env.INTERNAL_SERVICE_TOKEN ||
        process.env.INTERNAL_JWT_SIGNING_KEYS ||
        process.env.INTERNAL_JWT_SIGNING_KEY
    ),
    bookImport: process.env.BOOK_IMPORT_ENABLED === 'true',
  };
}
