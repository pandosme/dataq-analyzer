import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import process from 'process';
import dotenv from 'dotenv';
import YAML from 'yaml';
import { z } from 'zod';

const environmentFile = dotenv.config().parsed ?? {};

const booleanFromEnv = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const emptyAsUndefined = (schema) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema);

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  PORT: z.coerce.number().int().min(1).max(65535).default(80),
  CORS_ORIGIN: z.string().default('*'),
  MONGODB_URI: z.string().startsWith('mongodb').optional(),
  MONGODB_HOST: z.string().min(1).default('localhost'),
  MONGODB_PORT: z.coerce.number().int().min(1).max(65535).default(27017),
  MONGODB_DATABASE: z.string().min(1).default('dataq-analyzer'),
  MONGODB_USERNAME: z.string().default(''),
  MONGODB_PASSWORD: z.string().default(''),
  MONGODB_AUTH_REQUIRED: booleanFromEnv,
  MONGODB_AUTH_SOURCE: z.string().default('admin'),
  MQTT_BROKER_URL: z.union([z.literal(''), z.string().url()]).default(''),
  MQTT_USERNAME: z.string().default(''),
  MQTT_PASSWORD: z.string().default(''),
  JWT_SECRET: z.string().min(32).optional(),
  JWT_EXPIRES_IN: z.string().min(1).default('7d'),
  CREDENTIAL_ENCRYPTION_KEY: z.string().min(32).optional(),
  // Compose always supplies these keys (`${VAR:-}`), so an unset variable
  // arrives as an empty string. Treat that as "not provided" rather than as a
  // value that fails the length check and stops the container from starting.
  BOOTSTRAP_ADMIN_USERNAME: emptyAsUndefined(z.string().min(1).optional()),
  BOOTSTRAP_ADMIN_PASSWORD: emptyAsUndefined(z.string().min(12).optional()),
  MEDIAMTX_USERNAME: z.string().default(''),
  MEDIAMTX_PASSWORD: z.string().default(''),
});

const fileConfigSchema = z.object({
  app: z.object({
    name: z.string().min(1).default('DataQ Analyzer'),
    coordinateMax: z.number().int().positive().default(1000),
    defaultPageSize: z.number().int().positive().default(100),
    maxPageSize: z.number().int().positive().default(1000),
    defaultTimeRangeHours: z.number().positive().default(24),
    dataRetentionDays: z.number().int().positive().default(90),
  }).default({}),
  display: z.object({
    dateFormat: z.enum(['US', 'EU', 'ISO']).default('US'),
    pathVisualization: z.object({
      showStartPoints: z.boolean().default(true),
      showEndPoints: z.boolean().default(true),
      pathOpacity: z.number().min(0).max(1).default(0.7),
      pathLineWidth: z.number().positive().default(2),
    }).default({}),
  }).default({}),
  mqtt: z.object({
    enabled: z.boolean().default(true),
    topicPrefix: z.string().min(1).default('dataq/#'),
    useTls: z.boolean().default(false),
    rejectUnauthorized: z.boolean().default(true),
  }).default({}),
  playback: z.object({
    enabled: z.boolean().default(false),
    type: z.literal('MediaMTX').default('MediaMTX'),
    serverUrl: z.union([z.literal(''), z.string().url()]).default(''),
    preTime: z.number().nonnegative().default(5),
    postTime: z.number().nonnegative().default(5),
  }).default({}),
  devices: z.object({
    defaults: z.object({
      retentionDays: z.number().int().positive().nullable().default(null),
      filters: z.object({
        minDistance: z.number().nonnegative().default(20),
        minAge: z.number().nonnegative().default(2),
      }).default({}),
    }).default({}),
  }).default({}),
}).default({});

function formatValidationError(source, error) {
  const details = error.issues
    .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
    .join('; ');
  return new Error(`Invalid ${source}: ${details}`);
}

function loadEnvironment() {
  const result = environmentSchema.safeParse(process.env);
  if (!result.success) {
    throw formatValidationError('environment configuration', result.error);
  }

  const environment = result.data;
  environment.MEDIAMTX_USERNAME ||= environmentFile.MEDIAMTX_USERNAME || '';
  environment.MEDIAMTX_PASSWORD ||= environmentFile.MEDIAMTX_PASSWORD || '';
  if (environment.NODE_ENV === 'production' && !environment.JWT_SECRET) {
    throw new Error('JWT_SECRET must be set and contain at least 32 characters in production');
  }
  if (environment.NODE_ENV === 'production' && !environment.CREDENTIAL_ENCRYPTION_KEY) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY must be set and contain at least 32 characters in production');
  }
  if (environment.MONGODB_AUTH_REQUIRED && (!environment.MONGODB_USERNAME || !environment.MONGODB_PASSWORD)) {
    throw new Error('MongoDB username and password are required when MONGODB_AUTH_REQUIRED=true');
  }

  return environment;
}

function loadFileConfig() {
  const configPath = path.resolve(process.env.CONFIG_PATH || 'config.yaml');
  let parsed = {};

  try {
    if (fs.existsSync(configPath)) {
      parsed = YAML.parse(fs.readFileSync(configPath, 'utf8')) ?? {};
    }
  } catch (error) {
    throw new Error(`Unable to read ${configPath}: ${error.message}`);
  }

  const result = fileConfigSchema.safeParse(parsed);
  if (!result.success) {
    throw formatValidationError(configPath, result.error);
  }
  if (result.data.mqtt.enabled && !process.env.MQTT_BROKER_URL) {
    throw new Error('MQTT_BROKER_URL must be set when mqtt.enabled=true');
  }
  if (result.data.playback.enabled && !result.data.playback.serverUrl) {
    throw new Error('playback.serverUrl must be set when playback.enabled=true');
  }
  if (result.data.playback.enabled && (!environment.MEDIAMTX_USERNAME || !environment.MEDIAMTX_PASSWORD)) {
    throw new Error('MEDIAMTX_USERNAME and MEDIAMTX_PASSWORD must be set when MediaMTX playback is enabled');
  }

  return { configPath, value: result.data };
}

function buildMongoUri(environment) {
  if (environment.MONGODB_URI) {
    return environment.MONGODB_URI;
  }

  const credentials = environment.MONGODB_AUTH_REQUIRED
    ? `${encodeURIComponent(environment.MONGODB_USERNAME)}:${encodeURIComponent(environment.MONGODB_PASSWORD)}@`
    : '';
  const authSource = environment.MONGODB_AUTH_REQUIRED
    ? `?authSource=${encodeURIComponent(environment.MONGODB_AUTH_SOURCE)}`
    : '';

  return `mongodb://${credentials}${environment.MONGODB_HOST}:${environment.MONGODB_PORT}/${environment.MONGODB_DATABASE}${authSource}`;
}

const environment = loadEnvironment();
const loadedFileConfig = loadFileConfig();

export const installationConfig = loadedFileConfig.value;

export const dbConfig = {
  uri: buildMongoUri(environment),
  host: environment.MONGODB_HOST,
  port: String(environment.MONGODB_PORT),
  database: environment.MONGODB_DATABASE,
  username: environment.MONGODB_USERNAME,
  password: environment.MONGODB_PASSWORD,
  authRequired: environment.MONGODB_AUTH_REQUIRED,
  options: {},
};

export const serverConfig = {
  port: environment.PORT,
  nodeEnv: environment.NODE_ENV,
  isDevelopment: environment.NODE_ENV === 'development',
  corsOrigin: environment.CORS_ORIGIN,
  configPath: loadedFileConfig.configPath,
};

export const mqttConfig = {
  enabled: installationConfig.mqtt.enabled,
  brokerUrl: environment.MQTT_BROKER_URL,
  username: environment.MQTT_USERNAME || null,
  password: environment.MQTT_PASSWORD || null,
  useTls: installationConfig.mqtt.useTls,
  rejectUnauthorized: installationConfig.mqtt.rejectUnauthorized,
  topicPrefix: installationConfig.mqtt.topicPrefix,
  clientId: `dataq-analyzer-${crypto.randomBytes(4).toString('hex')}`,
};

export const authConfig = {
  bootstrapAdminUsername: environment.BOOTSTRAP_ADMIN_USERNAME || '',
  bootstrapAdminPassword: environment.BOOTSTRAP_ADMIN_PASSWORD || '',
  jwtSecret: environment.JWT_SECRET || crypto.randomBytes(64).toString('hex'),
  jwtExpiresIn: environment.JWT_EXPIRES_IN,
  credentialEncryptionKey: environment.CREDENTIAL_ENCRYPTION_KEY || '',
};

export const playbackConfig = {
  ...installationConfig.playback,
  username: environment.MEDIAMTX_USERNAME,
  password: environment.MEDIAMTX_PASSWORD,
};

export const appConfig = installationConfig.app;

export default {
  db: dbConfig,
  server: serverConfig,
  mqtt: mqttConfig,
  auth: authConfig,
  app: appConfig,
  display: installationConfig.display,
  playback: playbackConfig,
  devices: installationConfig.devices,
};
