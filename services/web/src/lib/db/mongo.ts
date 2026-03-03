import { MongoClient, type Db } from 'mongodb';

import { getMongoUri } from '@/lib/env';
import { logSecurityEvent } from '@/lib/logger';

let client: MongoClient | undefined;

declare global {
  var _mongoClient: MongoClient | undefined;
}

const MONGO_CLIENT_OPTIONS = {
  maxPoolSize: 20,
  minPoolSize: 0,
  maxIdleTimeMS: 60_000,
  serverSelectionTimeoutMS: 5_000,
  connectTimeoutMS: 5_000,
} as const;

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
  try {
    await mongoClient.connect();
    return mongoClient.db(dbName);
  } catch (error) {
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
