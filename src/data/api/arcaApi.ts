import type { z } from 'zod';
import { ProtocolFailure, TransportFailure } from '../../domain/failures.ts';
import type { ArcaApi } from '../../domain/ports/api.ts';
import { toDomainFailure } from './errorEnvelope.ts';
import {
  zActiveSessionResponse,
  zAnswerDetail,
  zAnswerPage,
  zConsentPoliciesResponse,
  zDeleteAnswerResult,
  zMemberProfile,
  zSaveAnswerResult,
  zSessionResponse,
  zTodaySemaResponse,
} from './generated/zod.gen.ts';
import type { HttpRequest, HttpTransport } from './transport.ts';

export const SAFE_QUERY_TIMEOUT_MS = 8_000;
export const CREATE_MEMBER_TIMEOUT_MS = 10_000;
export const SET_NICKNAME_TIMEOUT_MS = 10_000;
export const DELETE_MEMBER_TIMEOUT_MS = 15_000;
export const EVENT_BATCH_SCHEMA_VERSION = 1;

async function send<S extends z.ZodType>(
  transport: HttpTransport,
  request: HttpRequest,
  status: number,
  schema: S,
): Promise<z.output<S>> {
  const response = await transport(request);
  if (response.status === status) {
    const parsed = schema.safeParse(response.body);
    if (!parsed.success) throw new ProtocolFailure('schema');
    return parsed.data;
  }
  if (response.status >= 400) throw toDomainFailure(response.body);
  throw new ProtocolFailure('status');
}
async function sendEmpty(transport: HttpTransport, request: HttpRequest, status: number): Promise<void> {
  const response = await transport(request);
  if (response.status === status) return;
  if (response.status >= 400) throw toDomainFailure(response.body);
  throw new ProtocolFailure('status');
}
async function query<S extends z.ZodType>(
  transport: HttpTransport,
  request: HttpRequest,
  schema: S,
): Promise<z.output<S>> {
  try {
    return await send(transport, request, 200, schema);
  } catch (error) {
    if (
      !(error instanceof TransportFailure) ||
      !['network', 'timeout'].includes(error.reason) ||
      request.signal?.aborted
    )
      throw error;
    return send(transport, request, 200, schema);
  }
}
export function createArcaApi(transport: HttpTransport): ArcaApi {
  const request = (
    method: HttpRequest['method'],
    path: string,
    bearer: string,
    body?: unknown,
    signal?: AbortSignal,
  ): HttpRequest => ({
    method,
    path,
    bearer,
    timeoutMs: SAFE_QUERY_TIMEOUT_MS,
    ...(body === undefined ? {} : { body }),
    ...(signal ? { signal } : {}),
  });
  return {
    establishSession: (anonymousKey) =>
      send(
        transport,
        { method: 'POST', path: '/sessions', body: { anonymousKey }, timeoutMs: SAFE_QUERY_TIMEOUT_MS },
        201,
        zSessionResponse,
      ),
    async getConsentPolicies(auth, signal) {
      return (
        await query(
          transport,
          request('GET', '/consent-policies', auth.bearer, undefined, signal),
          zConsentPoliciesResponse,
        )
      ).consentPolicies;
    },
    createMember: (auth, consents) =>
      send(
        transport,
        {
          ...request('POST', '/members', auth.bearer, {
            consents: consents.map((c) => ({ policyId: c.policyId, version: c.version, agreed: true })),
          }),
          timeoutMs: CREATE_MEMBER_TIMEOUT_MS,
        },
        201,
        zActiveSessionResponse,
      ),
    getMember: (auth, signal) =>
      query(transport, request('GET', '/members/me', auth.bearer, undefined, signal), zMemberProfile),
    setNickname: (auth, nickname) =>
      send(
        transport,
        { ...request('PUT', '/members/me/nickname', auth.bearer, { nickname }), timeoutMs: SET_NICKNAME_TIMEOUT_MS },
        200,
        zMemberProfile,
      ),
    getToday: (auth, signal) =>
      query(transport, request('GET', '/semas/today', auth.bearer, undefined, signal), zTodaySemaResponse),
    createAnswer: (auth, input) =>
      send(
        transport,
        request('POST', '/answers', auth.bearer, {
          dailySemaId: input.dailySemaId,
          semaId: input.semaId,
          questionId: input.questionId,
          content: input.content,
        }),
        201,
        zSaveAnswerResult,
      ),
    updateAnswer: (auth, answerId, content) =>
      send(
        transport,
        request('PUT', `/answers/${encodeURIComponent(answerId)}`, auth.bearer, { content }),
        200,
        zSaveAnswerResult,
      ),
    deleteAnswer: (auth, answerId) =>
      send(
        transport,
        request('DELETE', `/answers/${encodeURIComponent(answerId)}`, auth.bearer),
        200,
        zDeleteAnswerResult,
      ),
    listAnswers: (auth, cursor, signal) =>
      query(
        transport,
        {
          ...request('GET', '/answers', auth.bearer, undefined, signal),
          ...(cursor === null ? {} : { query: { cursor } }),
        },
        zAnswerPage,
      ),
    getAnswer: (auth, answerId, signal) =>
      query(
        transport,
        request('GET', `/answers/${encodeURIComponent(answerId)}`, auth.bearer, undefined, signal),
        zAnswerDetail,
      ),
    deleteMember: (auth) =>
      sendEmpty(
        transport,
        { ...request('DELETE', '/members/me', auth.bearer), timeoutMs: DELETE_MEMBER_TIMEOUT_MS },
        204,
      ),
    sendEventBatch: (auth, batch) =>
      sendEmpty(
        transport,
        request('POST', '/analytics/event-batches', auth.bearer, {
          events: batch.events.map((event) => ({
            eventId: event.eventId,
            schemaVersion: EVENT_BATCH_SCHEMA_VERSION,
            name: event.name,
            occurredAt: event.occurredAt,
            properties: event.properties,
          })),
          ...(batch.appVersion === undefined ? {} : { appVersion: batch.appVersion }),
          ...(batch.platform === undefined ? {} : { platform: batch.platform }),
        }),
        202,
      ),
  };
}
