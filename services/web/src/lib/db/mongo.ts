import { MongoClient, type Db } from 'mongodb';

import { getCorePublicUrl, getMongoUri } from '@/lib/env';
import { logSecurityEvent } from '@/lib/logger';

let client: MongoClient | undefined;

declare global {
  var _mongoClient: MongoClient | undefined;
}

const MONGO_CLIENT_OPTIONS = {
  maxPoolSize: 20,
  minPoolSize: 0,
  maxIdleTimeMS: 60_000,
  serverSelectionTimeoutMS: 20_000,
  connectTimeoutMS: 20_000,
} as const;

async function wakeCoreForMongo() {
  const corePublicUrl = getCorePublicUrl();
  if (!corePublicUrl) {
    return;
  }

  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => abortController.abort(), 10_000);

  try {
    await fetch(new URL('/healthz', corePublicUrl), {
      method: 'GET',
      cache: 'no-store',
      signal: abortController.signal,
    });
  } catch {
    // Best-effort wake only.
  } finally {
    clearTimeout(timeoutHandle);
  }
}

export function getMongoClient(): MongoClient {
  const uri = getMongoUri();
  if (!uri) {
    throw new Error('Missing MONGODB_URI');
  }

  if (process.env.NODE_ENV === 'development') {
    if (!global._mongoClient) {
      global._mongoClient = new MongoClient(uri, MONGO_CLIENT_OPTIONS);
    }

    client = global._mongoClient;
  } else if (!client) {
    client = new MongoClient(uri, MONGO_CLIENT_OPTIONS);
  }

  return client;
}

export async function getMongoDb(dbName?: string): Promise<Db> {
  const mongoClient = getMongoClient();

  const connectOnce = async () => {
    await mongoClient.connect();
    return mongoClient.db(dbName);
  };

  try {
    return await connectOnce();
  } catch (error) {
    await wakeCoreForMongo();

    try {
      return await connectOnce();
    } catch {
      // fall through to structured logging using original error context below
    }

    await logSecurityEvent('mongo.connect.fail', {
      route: 'mongo.connect',
      details: {
        dbName: dbName ?? null,
        message: error instanceof Error ? error.message : 'unknown_error',
      },
    });
    throw error;
  }
}
