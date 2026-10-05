import { TextDecoder } from 'node:util'
import type { IncomingMessage, RequestListener, ServerResponse } from 'node:http'
import { validateProtocolResponse } from '@brambodev/contracts'
import type { ArtifactProvider, JsonValue, Principal, ProtocolResponse, RunStore } from '@brambodev/contracts'
import { authorizeOperation, isPrincipal } from './authorization.ts'
import { InvalidProtocolPayload, parseRequest, planOperation } from './routes.ts'

const DEFAULT_MAX_BODY_BYTES = 1024 * 1024
const ENDPOINT = '/v1/workflow'

export interface WorkflowCoordinatorOptions {
  readonly store: RunStore
  readonly artifacts: ArtifactProvider
  readonly authenticate: (request: IncomingMessage) => Promise<Principal | undefined>
  readonly authorize: (principal: Principal, operation: string, resource: JsonValue) => Promise<boolean>
  readonly workerAllowed: (principal: Principal) => Promise<boolean>
  readonly maxBodyBytes?: number
}

function assertOptions(value: WorkflowCoordinatorOptions): number {
  if (!value || typeof value !== 'object') throw new TypeError('Workflow coordinator options are required')
  if (!value.store || typeof value.store !== 'object') throw new TypeError('RunStore is required')
  if (!value.artifacts || typeof value.artifacts !== 'object') throw new TypeError('ArtifactProvider is required')
  for (const [name, callback] of [
    ['authenticate', value.authenticate],
    ['authorize', value.authorize],
    ['workerAllowed', value.workerAllowed],
  ] as const) {
    if (typeof callback !== 'function') throw new TypeError(`Workflow coordinator ${name} callback is required`)
  }
  const limit = value.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > DEFAULT_MAX_BODY_BYTES) {
    throw new RangeError('maxBodyBytes must be a positive integer no greater than 1 MiB')
  }
  return limit
}

async function readBoundedBody(request: IncomingMessage, maxBodyBytes: number): Promise<Buffer | undefined> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array | string)
    total += bytes.byteLength
    if (total > maxBodyBytes) return undefined
    chunks.push(bytes)
  }
  return Buffer.concat(chunks, total)
}

function writeResponse(response: ServerResponse, statusCode: number, value: ProtocolResponse): void {
  const envelope = validateProtocolResponse(value)
  response.statusCode = statusCode
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader('cache-control', 'no-store')
  response.end(JSON.stringify(envelope))
}

function denied(response: ServerResponse, statusCode = 404): void {
  writeResponse(response, statusCode, { version: 1, status: 'denied', code: 'denied' })
}

function invalid(response: ServerResponse, code = 'invalid_request', statusCode = 400): void {
  writeResponse(response, statusCode, { version: 1, status: 'invalid', code })
}

function unavailable(response: ServerResponse): void {
  writeResponse(response, 503, { version: 1, status: 'unavailable', code: 'unavailable' })
}

async function decodeRequest(request: IncomingMessage, maxBodyBytes: number): Promise<unknown | undefined> {
  const body = await readBoundedBody(request, maxBodyBytes)
  if (!body) return undefined
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(body)
    return JSON.parse(text) as unknown
  } catch {
    throw new InvalidProtocolPayload('invalid JSON')
  }
}

export function createWorkflowCoordinator(options: WorkflowCoordinatorOptions): { handler: RequestListener; close(): Promise<void> } {
  const maxBodyBytes = assertOptions(options)

  const handler: RequestListener = async (request, response) => {
    if (request.method !== 'POST' || request.url?.split('?', 1)[0] !== ENDPOINT) {
      invalid(response, 'not_found', 404)
      return
    }
    const contentType = request.headers['content-type']
    if (typeof contentType !== 'string' || !/^application\/json(?:\s*;|$)/i.test(contentType)) {
      invalid(response, 'invalid_content_type', 415)
      return
    }

    let body: unknown
    try {
      body = await decodeRequest(request, maxBodyBytes)
    } catch (error) {
      if (error instanceof InvalidProtocolPayload) {
        invalid(response)
        return
      }
      invalid(response)
      return
    }
    if (body === undefined) {
      invalid(response, 'body_too_large', 413)
      return
    }

    let protocolRequest
    let plan
    try {
      protocolRequest = parseRequest(body)
    } catch {
      invalid(response)
      return
    }

    let principal: Principal | undefined
    try {
      principal = await options.authenticate(request)
    } catch {
      unavailable(response)
      return
    }
    if (!isPrincipal(principal)) {
      denied(response, 404)
      return
    }

    try {
      plan = planOperation(protocolRequest, principal, options.store, options.artifacts, maxBodyBytes)
    } catch (error) {
      if (error instanceof InvalidProtocolPayload) invalid(response)
      else invalid(response)
      return
    }
    if (!plan.inScope) {
      denied(response, 404)
      return
    }

    let authorized: boolean
    try {
      authorized = await authorizeOperation(
        principal,
        plan.operation,
        plan.resource,
        options.authorize,
        options.workerAllowed,
      )
    } catch {
      unavailable(response)
      return
    }
    if (!authorized) {
      denied(response, 404)
      return
    }

    try {
      const result = await plan.execute()
      if (result.status === 'denied') {
        denied(response, 404)
        return
      }
      if (result.status === 'invalid') {
        invalid(response, result.code ?? 'invalid_request')
        return
      }
      if (result.status === 'unavailable') {
        unavailable(response)
        return
      }
      writeResponse(response, 200, {
        version: 1,
        status: 'ok',
        ...(Object.hasOwn(result, 'payload') ? { payload: result.payload } : {}),
        ...(result.code ? { code: result.code } : {}),
      })
    } catch {
      unavailable(response)
    }
  }

  return { handler, close: async () => {} }
}
