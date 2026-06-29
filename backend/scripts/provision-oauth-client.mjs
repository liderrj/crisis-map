#!/usr/bin/env node
// Provisions (or rotates the secret of) a partner OAuth2 client in the
// CrisisMap OAuthClientsTable. Prints the client_id and the new
// client_secret exactly once on stdout; they cannot be recovered from
// storage after the script exits.
//
// Usage:
//   AWS_PROFILE=arkem node scripts/provision-oauth-client.mjs create \
//     --name "Bomberos Caracas" --partner-id bomberos-caracas \
//     --scopes "incidents:read incidents:write"
//
//   AWS_PROFILE=arkem node scripts/provision-oauth-client.mjs rotate-secret \
//     --client-id bomberos-caracas-XXXXXX
//
//   AWS_PROFILE=arkem node scripts/provision-oauth-client.mjs disable \
//     --client-id bomberos-caracas-XXXXXX

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';

const TABLE = process.env.OAUTH_CLIENTS_TABLE ?? 'CrisisMapStack-OAuthClientsTableOAuthClients';

const client = new DynamoDBClient({});
const doc = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });

function hashSecret(s) {
  return createHash('sha256').update(s).digest('hex');
}

function generateSecret() {
  return randomBytes(32).toString('hex'); // 64 hex chars
}

function generateClientId(partnerId) {
  // Human-friendly but unique. The random suffix prevents two partners
  // sharing an id prefix from clashing.
  return `${partnerId}-${randomBytes(6).toString('hex')}`;
}

async function create({ name, partnerId, scopes, rateLimit, sandbox }) {
  if (!name || !partnerId) {
    throw new Error('--name and --partner-id are required');
  }
  const clientId = generateClientId(partnerId);
  const clientSecret = generateSecret();
  const now = Math.floor(Date.now() / 1000);
  await doc.send(new PutCommand({
    TableName: TABLE,
    Item: {
      clientId,
      clientSecretHash: hashSecret(clientSecret),
      partnerId,
      name,
      scopes: scopes ?? ['incidents:read'],
      rateLimit: rateLimit ?? 60, // req/min
      enabled: true,
      sandbox: sandbox === true,
      createdAt: now,
    },
  }));
  return {
    clientId,
    clientSecret,
    partnerId,
    name,
    scopes: scopes ?? ['incidents:read'],
    sandbox: sandbox === true,
  };
}

async function rotateSecret({ clientId }) {
  if (!clientId) throw new Error('--client-id is required');
  const existing = await doc.send(new GetCommand({ TableName: TABLE, Key: { clientId } }));
  if (!existing.Item) throw new Error(`Client ${clientId} not found`);
  const clientSecret = generateSecret();
  await doc.send(new UpdateCommand({
    TableName: TABLE,
    Key: { clientId },
    UpdateExpression: 'SET clientSecretHash = :h, rotatedAt = :now',
    ExpressionAttributeValues: { ':h': hashSecret(clientSecret), ':now': Math.floor(Date.now() / 1000) },
  }));
  return { clientId, clientSecret, partnerId: existing.Item.partnerId };
}

async function setEnabled({ clientId, enabled }) {
  if (!clientId) throw new Error('--client-id is required');
  await doc.send(new UpdateCommand({
    TableName: TABLE,
    Key: { clientId },
    UpdateExpression: 'SET enabled = :b',
    ExpressionAttributeValues: { ':b': enabled },
  }));
  return { clientId, enabled };
}

async function setSandbox({ clientId, sandbox }) {
  if (!clientId) throw new Error('--client-id is required');
  await doc.send(new UpdateCommand({
    TableName: TABLE,
    Key: { clientId },
    UpdateExpression: 'SET sandbox = :b',
    ExpressionAttributeValues: { ':b': sandbox },
  }));
  return { clientId, sandbox };
}

function printCreated(r) {
  // ASCII art border so a casual log-tailing doesn't miss the secret.
  const bar = '!'.repeat(72);
  console.log(bar);
  console.log('NEW OAUTH CLIENT — save the secret NOW. It is not recoverable.');
  console.log(bar);
  console.log(`client_id     : ${r.clientId}`);
  console.log(`client_secret : ${r.clientSecret}`);
  console.log(`partner_id    : ${r.partnerId}`);
  console.log(`name          : ${r.name ?? ''}`);
  console.log(`scopes        : ${(r.scopes ?? []).join(' ')}`);
  console.log(bar);
}

function printSecret(r) {
  const bar = '!'.repeat(72);
  console.log(bar);
  console.log('ROTATED SECRET — save it NOW. It is not recoverable.');
  console.log(bar);
  console.log(`client_id     : ${r.clientId}`);
  console.log(`client_secret : ${r.clientSecret}`);
  console.log(`partner_id    : ${r.partnerId}`);
  console.log(bar);
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      'name': { type: 'string' },
      'partner-id': { type: 'string' },
      'scopes': { type: 'string' },
      'rate-limit': { type: 'string' },
      'client-id': { type: 'string' },
      // Bare flag for `create` (presence = sandbox on) and ignored
      // for `set-sandbox` (which uses a positional arg).
      'sandbox': { type: 'boolean', default: false },
    },
  });

  const cmd = positionals[0];
  if (!cmd) {
    console.error('Usage: provision-oauth-client.mjs <create|rotate-secret|set-sandbox|disable|enable> [flags]');
    process.exit(2);
  }
  const scopes = values.scopes ? values.scopes.split(/\s+/).filter(Boolean) : undefined;
  const rateLimit = values['rate-limit'] ? Number.parseInt(values['rate-limit'], 10) : undefined;
  // For `create`, sandbox is on when --sandbox was passed.
  // For `set-sandbox`, the desired state is the first positional arg after the subcommand.
  const sandbox = values.sandbox === true;

  if (cmd === 'create') {
    const r = await create({ name: values.name, partnerId: values['partner-id'], scopes, rateLimit, sandbox });
    printCreated(r);
  } else if (cmd === 'set-sandbox') {
    if (!values['client-id']) {
      console.error('Usage: provision-oauth-client.mjs set-sandbox --client-id <id> <true|false>');
      process.exit(2);
    }
    const desired = (positionals[1] ?? '').toLowerCase();
    if (desired !== 'true' && desired !== 'false') {
      console.error('set-sandbox requires a positional arg: `true` or `false`');
      console.error('Example: provision-oauth-client.mjs set-sandbox --client-id foo true');
      process.exit(2);
    }
    const r = await setSandbox({ clientId: values['client-id'], sandbox: desired === 'true' });
    console.log(JSON.stringify(r, null, 2));
  } else if (cmd === 'rotate-secret') {
    const r = await rotateSecret({ clientId: values['client-id'] });
    printSecret(r);
  } else if (cmd === 'disable' || cmd === 'enable') {
    const r = await setEnabled({ clientId: values['client-id'], enabled: cmd === 'enable' });
    console.log(JSON.stringify(r, null, 2));
  } else {
    console.error(`Unknown command: ${cmd}`);
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e.stack ?? e.message);
  process.exit(1);
});
