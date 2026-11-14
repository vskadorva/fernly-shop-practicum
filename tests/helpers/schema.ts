import Ajv, { type AnySchema, type ErrorObject } from 'ajv';
import type { APIRequestContext } from '@playwright/test';

const ajv = new Ajv({ strict: false, allErrors: true });

/** One load per worker. Each Playwright worker is its own process. */
let openApiReady: Promise<void> | undefined;

function isSchemaDocument(value: unknown): value is AnySchema {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function loadOpenApi(request: APIRequestContext): Promise<void> {
  if (!openApiReady) {
    openApiReady = (async () => {
      const response = await request.get('/openapi.json');
      if (!response.ok()) {
        throw new Error(`GET /openapi.json failed with status ${response.status()}`);
      }
      const doc: unknown = await response.json();
      if (!isSchemaDocument(doc)) {
        throw new Error('GET /openapi.json did not return a JSON object');
      }
      ajv.addSchema(doc, 'openapi');
    })().catch((error: unknown) => {
      openApiReady = undefined;
      throw error;
    });
  }
  return openApiReady;
}

function formatAjvErrors(errors: ErrorObject[] | null | undefined): string {
  const lines = (errors ?? []).map((error) => {
    const path = error.instancePath === '' ? '/' : error.instancePath;
    return `${path} ${error.message ?? error.keyword}`;
  });
  return lines.length > 0 ? lines.join('\n') : 'no Ajv errors reported';
}

export async function expectSchema(
  request: APIRequestContext,
  body: unknown,
  name: string,
): Promise<void> {
  await loadOpenApi(request);
  const ref = `openapi#/components/schemas/${name}`;
  const validate = ajv.getSchema(ref);
  if (!validate) {
    throw new Error(`Schema "${name}" does not exist at ${ref}`);
  }
  const valid = validate(body);
  if (typeof valid !== 'boolean') {
    throw new Error(`Schema "${name}" did not validate synchronously`);
  }
  if (!valid) {
    throw new Error(`Response does not match schema "${name}":\n${formatAjvErrors(validate.errors)}`);
  }
}
