import { ADAPTERS, SOURCE_REGISTRY } from '@ntk/hunter-core';
import { createApp } from './app.js';
import { loadConfig, describeConfigProblems, sensitiveValues } from './config.js';
import { resolveDeploymentScope } from './deploymentScope.js';
import { createLogger } from './logging.js';
import { FirestoreDocumentStore, MemoryDocumentStore } from './firestore/firestoreStore.js';
import { FirestoreOpportunityWriter } from './firestore/writer.js';
import { FirestoreRunStateStore, MemoryRunStateStore, type SourceRunStateStore } from './run/stateStore.js';
import { RunService } from './run/runService.js';
import type { DocumentStore } from './firestore/documentStore.js';
import { inspectTelegramSetup, sendControlledTelegramTest } from './notifications/telegram.js';
import { createPersonalRouter } from './personal.js';
import { dispatchPersonalNotices } from './notifications/personalized.js';
import { IntelligenceWriter } from './firestore/intelligenceWriter.js';
import { PersistentRunGuard } from './run/guard.js';

/**
 * Service bootstrap.
 *
 * Wiring order matters: configuration is loaded and validated FIRST, the logger
 * is created with the secret literals already registered for redaction, and the
 * document store is chosen from configuration rather than from a hard-coded
 * environment check scattered through the code.
 */
export function bootstrap(env: NodeJS.ProcessEnv = process.env) {
  const config = loadConfig(env);
  const logger = createLogger(config.logLevel, sensitiveValues(config));
  const problems = describeConfigProblems(config);

  if (problems.length > 0) {
    // Loud but non-fatal: the process stays up so /ready can report exactly what
    // is missing instead of the platform seeing a crash loop with no detail.
    logger.warn('Configuration is incomplete', { problems });
  }

  let store: DocumentStore;
  let stateStore: SourceRunStateStore;

  if (config.usingEmulator || config.projectId) {
    const firestoreStore = FirestoreDocumentStore.create(config, logger);
    store = firestoreStore;
    stateStore = FirestoreRunStateStore.create(firestoreStore.database);
  } else {
    // No Firestore configuration: validate everything, persist nothing, and say
    // so in /ready rather than reporting writes that never happened.
    logger.warn('No Firestore configuration found; writes will be validated but not persisted');
    store = new MemoryDocumentStore({ dryRun: true });
    stateStore = new MemoryRunStateStore();
  }

  const baseWriter = new FirestoreOpportunityWriter(store);
  const writer = store instanceof FirestoreDocumentStore ? new IntelligenceWriter(store.database,baseWriter) : baseWriter;
  const resolvedScope = resolveDeploymentScope(env.HUNT_DEPLOYMENT_SCOPE);
  logger.info('Deployment scope resolved', { scope: resolvedScope.scope, source: resolvedScope.source });

  const runService = new RunService({
    config,
    logger,
    sources: SOURCE_REGISTRY,
    adapters: ADAPTERS,
    writer,
    stateStore,
    deploymentScope: resolvedScope.scope,
    ...(store instanceof FirestoreDocumentStore ? {guard:new PersistentRunGuard(store.database)} : {}),
    ...(store instanceof FirestoreDocumentStore ? { afterRun: () => dispatchPersonalNotices((store as FirestoreDocumentStore).database, env) } : {})
  });

  const app = createApp({
    config,
    logger,
    runService,
    stateStore,
    deploymentScope: resolvedScope.scope,
    ...(store instanceof FirestoreDocumentStore ? { personalRouter: createPersonalRouter(store.database,undefined,env.NOTIFICATION_OWNER_UID) } : {}),
    ...(env.TELEGRAM_BOT_TOKEN ? { inspectNotificationSetup: () => inspectTelegramSetup(env.TELEGRAM_BOT_TOKEN!) } : {}),
    ...(store instanceof FirestoreDocumentStore && env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_OWNER_CHAT_ID && env.NOTIFICATION_OWNER_UID ? {
      sendNotificationTest: () => sendControlledTelegramTest({ token: env.TELEGRAM_BOT_TOKEN!, chatId: env.TELEGRAM_OWNER_CHAT_ID!, ownerUid: env.NOTIFICATION_OWNER_UID!, db: (store as FirestoreDocumentStore).database })
    } : {}),
    readinessProbe: async () => {
      if (!(store instanceof FirestoreDocumentStore)) return { firestore: false, detail: 'Firestore not configured' };
      // Verify the mounted credential and connectivity with a real server read.
      await store.database.doc('internal/readiness').get();
      return { firestore: true, detail: 'live server read succeeded' };
    }
  });

  return { app, config, logger, runService, store, deploymentScope: resolvedScope };
}

async function main(): Promise<void> {
  const { app, config, logger } = bootstrap();

  const server = app.listen(config.port, () => {
    logger.info('Hunter API listening', {
      port: config.port,
      mode: config.usingEmulator ? 'emulator' : 'live',
      sources: SOURCE_REGISTRY.length,
      adapters: ADAPTERS.length
    });
  });

  const shutdown = (signal: string) => {
    logger.info('Shutting down', { signal });
    server.close(() => process.exit(0));
    // Do not hang forever on a stuck connection.
    setTimeout(() => process.exit(0), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Only start listening when executed directly, so tests can import bootstrap().
const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('dist/index.js') ?? false;
if (invokedDirectly) {
  main().catch(error => {
    // Nothing sensitive is printed: the error is message-only.
    console.error(JSON.stringify({ level: 'error', message: 'Failed to start', error: String(error instanceof Error ? error.message : error) }));
    process.exit(1);
  });
}
