# ARCA 프론트엔드 API 응답 스펙

기준: 2026-10-14 사용자 제공 백엔드 전환 가이드, `feat/19-product-event-collection`, 계약 2.4.2.
이 문서는 이전 1.1.0의 15개 명령/티켓 API 정리를 대체한다. 현재 서버에서 구현된 13개 API를 모두 프론트엔드에 연결했다. 서버 주소는 아직 없으므로 실제 서버 호출 검증은 진행하지 않았다.

## 1. 엔드포인트·응답·상황별 예외

Base URL은 `${VITE_ARCA_API_BASE}/v1`이다. 세션 교환 외에는 Bearer 인증을 사용한다. 성공 응답은 DTO 자체이며 `data` wrapper가 없다. `Idempotency-Key`를 보내지 않는다. 모든 응답은 `Cache-Control: no-store`다.

| 엔드포인트 | 성공 응답 | 상황별 개별 예외 |
|---|---|---|
| `POST /v1/sessions` | `201 SessionResponse` | 익명 키 형식 오류 → `400 INVALID_REQUEST`; 무효 키 → `401 ANONYMOUS_KEY_INVALID`; 외부 검증 장애 → `503 MAINTENANCE` |
| `GET /v1/consent-policies` | `200 ConsentPoliciesResponse` | GUEST·ACTIVE 허용; 공통 인증/서버 예외 |
| `POST /v1/members` | `201 ActiveSessionResponse` | ACTIVE 또는 이미 가입 → `409 MEMBER_ALREADY_EXISTS`; 정책 ID·버전 변경 → `422 POLICY_VERSION_CHANGED`; 필수 동의 누락 → `422 CONSENT_REQUIRED`; 동시 중복 제출 경합 → `500 DATABASE_ERROR` |
| `GET /v1/members/me` | `200 MemberProfile` | GUEST → `404 MEMBER_NOT_FOUND` |
| `PUT /v1/members/me/nickname` | `200 MemberProfile` | nickname 생략·추가 필드 → `400 INVALID_REQUEST`; 닉네임 검증 실패 → `422 NICKNAME_INVALID` |
| `GET /v1/semas/today` | `200 TodaySemaResponse` | GUEST → `403 SESSION_SCOPE_INSUFFICIENT`; 오늘 SEMA 없음 → `503 SEMA_NOT_FOUND` |
| `POST /v1/answers` | `201 SaveAnswerResult` | 날짜 변경 → `422 DATE_CHANGED`; 오늘 SEMA 없음 → `503 SEMA_NOT_FOUND`; SEMA·질문 변경 → `422 SEMA_REPLACED`; 오늘 답변 존재 → `409 ANSWER_ALREADY_EXISTS`; 본문 검증 실패 → `422 ANSWER_CONTENT_INVALID`; 동시 중복 제출 경합 → `500 DATABASE_ERROR` |
| `PUT /v1/answers/{answerId}` | `200 SaveAnswerResult` | 비숫자 경로 ID·추가 필드 → `400 INVALID_REQUEST`; 없음·삭제·비소유 → `404 ANSWER_NOT_FOUND`; 본문 검증 실패 → `422 ANSWER_CONTENT_INVALID` |
| `DELETE /v1/answers/{answerId}` | `200 DeleteAnswerResult` | 비숫자 경로 ID → `400 INVALID_REQUEST`; 없음·삭제·비소유 → `404 ANSWER_NOT_FOUND` |
| `GET /v1/answers?cursor=` | `200 AnswerPage` | cursor 형식 오류 → `400 CURSOR_INVALID`; GUEST → `403 SESSION_SCOPE_INSUFFICIENT` |
| `GET /v1/answers/{answerId}` | `200 AnswerDetail` | 비숫자 경로 ID → `400 INVALID_REQUEST`; GUEST → `403 SESSION_SCOPE_INSUFFICIENT`; 없음·삭제·비소유 → `404 ANSWER_NOT_FOUND` |
| `DELETE /v1/members/me` | `204` body 없음 | GUEST → `403 SESSION_SCOPE_INSUFFICIENT`; 이미 삭제되어 token 폐기 → `401 SESSION_RECOVERY_REQUIRED`; 동시 삭제 경합 → `404 MEMBER_NOT_FOUND` 또는 `500 DATABASE_ERROR`; 트랜잭션 실패 → `500 INTERNAL_ERROR`/`DATABASE_ERROR` |
| `POST /v1/analytics/event-batches` | `202` body 없음 | 이름·속성·개수·schemaVersion·appVersion 위반 → `400 INVALID_REQUEST`(batch 전체 거절); 동시 처리 경합 → `500 DATABASE_ERROR` |

닉네임·오늘 조회·답변 변경·기록 조회·모든 데이터 삭제는 ACTIVE만 허용한다. 회원 가입은 GUEST만 허용하고 ACTIVE에는 409를 반환한다. 이벤트 전송은 GUEST·ACTIVE 모두 허용한다. DELETE에는 body·query를 보내지 않는다. 오늘·목록 조회에 excerptProfile query를 보내지 않는다. 가입·작성·모든 데이터 삭제 버튼은 요청이 끝날 때까지 비활성화하고, 같은 대상의 진행 중 요청을 공유한다.

## 2. 응답 양식

아래는 현재 OpenAPI로 생성한 wire 타입의 발췌다. 문자열 ID는 opaque이며 값의 의미를 해석하지 않는다. 시간은 RFC 3339 UTC `Z` 형식이고 소수 초를 허용한다. KST 날짜는 `YYYY-MM-DD`다. `count`는 0 이상 정수다. `null`은 명시적으로 반환하고, 미응답 `answer.value`는 생략한다.

```ts
type MemberProfile = {
    memberCode: string;
    nickname: string | null;
};

type SessionContext = {
    mode: 'GUEST';
    member: null;
} | {
    mode: 'ACTIVE';
    member: MemberProfile;
};

type SessionResponse = {
    accessToken: string;
    expiresAt: Instant;
    context: SessionContext;
};

type ActiveSessionResponse = {
    accessToken: string;
    expiresAt: Instant;
    context: {
        mode: 'ACTIVE';
        member: MemberProfile;
    };
};

type ConsentPolicy = {
    policyId: string;
    version: string;
    title: string;
    url: string;
    required: boolean;
};

type ConsentPoliciesResponse = {
    consentPolicies: Array<ConsentPolicy>;
};

type Question = {
    questionId: EntityId;
    text: string;
};

type Sema = {
    dailySemaId: EntityId;
    semaId: EntityId;
    semaCode: string;
    dateKst: KstDate;
    primaryQuestion: Question;
    alternateQuestion: Question;
};

type AnswerCount = {
    count: number;
};

type AnswerSummary = {
    answerId: EntityId;
    dailySemaId: EntityId;
    semaId: EntityId;
    semaCode: string;
    createdAt: Instant;
    updatedAt: Instant;
    createdDateKst: KstDate;
    isEdited: boolean;
    question: Question;
};

type AnswerDetail = AnswerSummary & {
    content: string;
};

type AnswerPage = {
    items: Array<AnswerSummary>;
    nextCursor: string | null;
};

type TodaySemaResponse = {
    dateKst: KstDate;
    sema: Sema;
    answer: {
        state: 'UNANSWERED';
    } | {
        state: 'ANSWERED';
        value: AnswerDetail;
    };
    activeAnswerCount: AnswerCount;
};

type SaveAnswerResult = {
    answer: AnswerDetail;
    activeAnswerCount: AnswerCount;
};

type DeleteAnswerResult = {
    activeAnswerCount: AnswerCount;
};

type CreateEventBatchInput = {
    events: Array<ProductEventInput>;
    appVersion?: string;
    platform?: 'IOS' | 'ANDROID';
};
```

`ProductEventInput`은 `eventId`(UUID), `schemaVersion: 1`, `name`, `occurredAt`, 이름별 `properties`의 닫힌 union이다. 허용 이름은 onboarding_started, onboarding_skipped, today_sema_viewed, alternate_question_viewed, sema_question_changed, answer_started, answer_save_failed, archive_viewed이며 속성은 모두 필수다. 서버 소유 이벤트(onboarding_completed, answer_saved, answer_edited, answer_deleted, all_data_deleted)는 보내지 않는다.

목록 한 page는 최대 20개이고 answerId 내림차순(작성 순서의 역순)이다. 이어 보는 중 새로 쓴 답변은 끼지 않고, 받은 답변을 지워도 다음 page에서 빠지는 항목이 없다. cursor는 해석하거나 직접 만들지 않으며 만료가 없다.

세션 응답에는 정책 목록이 없다. 가입 화면 진입 시 정책 API를 따로 조회한다. 회원 가입 성공 응답의 ACTIVE token으로 즉시 교체하며 기존 GUEST token은 폐기된다. 닉네임 변경 응답은 receipt wrapper 없이 MemberProfile 자체다.

오늘 답변은 전문 content를 포함한다. 저장 당시 질문과 SEMA를 유지하므로 `answer.value.semaId`와 현재 `sema.semaId`가 다를 수 있다. 수정은 과거 날짜에도 가능하고 질문·SEMA·생성 시각·생성 날짜를 유지한다. revision·버전·발췌·availability wrapper는 사용하지 않는다.

## 3. 오류 응답 양식

```json
{
  "error": {
    "code": "SESSION_RECOVERY_REQUIRED",
    "category": "AUTH",
    "requestId": "synthetic-request-1",
    "recovery": { "kind": "REESTABLISH_SESSION", "recoveryAllowed": true }
  }
}
```

code·category·requestId는 필수다. 자유 형식 message·details·stack을 사용하지 않는다. 다음 code만 해당 recovery를 포함한다.

| code | recovery |
|---|---|
| `SESSION_RECOVERY_REQUIRED` | `{ kind: 'REESTABLISH_SESSION', recoveryAllowed: true }` |
| `POLICY_VERSION_CHANGED` | `{ kind: 'REFRESH_POLICIES', policies: ConsentPolicy[] }` |
| `DATE_CHANGED`, `SEMA_REPLACED` | `{ kind: 'REFRESH_TODAY' }` |

`RATE_LIMITED`, `MAINTENANCE`만 선택적인 retryAfterSeconds(0 이상 정수)를 포함할 수 있다. Retry-After와 같은 값이다. recovery·retryAfterSeconds는 해당하지 않으면 생략한다.

| HTTP | category | code | 상황 |
|---|---|---|---|
| 400 | VALIDATION | `INVALID_REQUEST` | 필수 필드·JSON·추가 필드 등 요청 형식 오류 |
| 400 | VALIDATION | `CURSOR_INVALID` | 목록 cursor 형식 오류. 첫 page부터 다시 읽음 |
| 401 | AUTH | `ANONYMOUS_KEY_INVALID` | 익명 키 무효 |
| 401 | AUTH | `SESSION_INVALID` | 헤더 없음·형식 오류·미발급 token. 자동 복구 없음 |
| 401 | AUTH | `SESSION_RECOVERY_REQUIRED` | 만료·폐기된 token. 세션 재교환 후 정상 요청 최대 1회 재시도, 가입 POST 제외 |
| 403 | AUTH | `SESSION_SCOPE_INSUFFICIENT` | 세션 mode로 실행 불가 |
| 404 | VALIDATION | `ENDPOINT_NOT_FOUND` | 구현되지 않은 경로 |
| 404 | VALIDATION | `MEMBER_NOT_FOUND` | 회원 조회의 GUEST, 동시 모든 데이터 삭제에서 진 요청 |
| 404 | VALIDATION | `ANSWER_NOT_FOUND` | 답변 없음·삭제·비소유 |
| 405 | VALIDATION | `METHOD_NOT_SUPPORTED` | 지원하지 않는 HTTP method |
| 406 | VALIDATION | `MEDIA_TYPE_NOT_ACCEPTABLE` | Accept가 JSON을 허용하지 않음 |
| 409 | CONFLICT | `MEMBER_ALREADY_EXISTS` | 이미 가입 |
| 409 | CONFLICT | `ANSWER_ALREADY_EXISTS` | 오늘 답변 존재 |
| 415 | VALIDATION | `MEDIA_TYPE_NOT_SUPPORTED` | Content-Type이 JSON이 아님 |
| 422 | VALIDATION | `CONSENT_REQUIRED` | 필수 동의 누락 |
| 422 | VALIDATION | `POLICY_VERSION_CHANGED` | 정책 ID·버전 변경 |
| 422 | VALIDATION | `NICKNAME_INVALID` | trim 후 2~12 EGC·UTF-16 255 상한·금지 문자 규칙 위반 |
| 422 | VALIDATION | `DATE_CHANGED` | 작성 대상 날짜가 오늘이 아님 |
| 422 | VALIDATION | `SEMA_REPLACED` | 작성 대상 SEMA·질문 변경 |
| 422 | VALIDATION | `ANSWER_CONTENT_INVALID` | 본문 1~2,000 EGC 또는 코드 포인트 15,000 상한 위반 |
| 429 | RATE_LIMIT | `RATE_LIMITED` | 코드만 정의되어 있으며 현재는 발생하지 않음 |
| 500 | MAINTENANCE | `INTERNAL_ERROR` | 예상하지 못한 서버 오류 |
| 500 | MAINTENANCE | `DATABASE_ERROR` | DB 오류·동시 중복 제출 경합 |
| 503 | MAINTENANCE | `MAINTENANCE` | 점검·외부 검증 장애 |
| 503 | MAINTENANCE | `SEMA_NOT_FOUND` | 오늘 SEMA 편성 없음 |

본문은 trim하지 않고 공백·개행을 그대로 저장하며 공백만 있는 문자열도 길이 범위 내에서 유효하다. 닉네임 해제는 빈 문자열 대신 null이다. 명령 상태·ticket·receipt·revision 관련 과거 오류 코드는 사용하지 않는다.

## 4. 응답 유실 처리

| 요청 | 현재 프론트 처리 |
|---|---|
| 가입 | 같은 POST를 자동 재전송하지 않고 세션 재교환. ACTIVE면 가입 완료와 새 token을 반영 |
| 닉네임 변경 | 입력 유지. 사용자가 같은 body로 다시 저장 가능 |
| 답변 작성 | 오늘 조회로 날짜·SEMA·질문·본문이 같은 기록을 확인. 미확인이면 글을 유지하고 확인·명시적 재저장 제공 |
| 답변 수정 | 기록 상세 조회로 본문이 같으면 완료. 그 외 미확인 유지, 같은 body 명시적 재저장 제공 |
| 답변 삭제 | 기록 상세 조회가 404면 완료. 답변이 남아 있으면 미확인 유지, 명시적 DELETE 재전송의 404도 완료로 처리 |
| 모든 데이터 삭제 | DELETE를 재전송하지 않고 세션 재교환. GUEST면 완료, ACTIVE면 미적용(다시 시도 제공), 재교환도 실패하면 미확인 유지 후 `삭제 결과 확인하기` |
| 이벤트 batch | 통신 실패·5xx는 같은 eventId로 재전송(2s·8s·30s, 화면 숨김·재연결 시 즉시). 400은 batch 폐기 |

timeout·네트워크 단절·응답 파싱 실패·5xx 자체로 변경이 적용되지 않았다고 판정하지 않는다. 다른 기기에서 작성한 다른 내용이 발견되면 사용자가 작성한 임시글을 지우지 않는다. 결과 폴링·command 조회·ack·closure 요청은 없다.

## 5. 서버 확인이 남은 항목

13개 API는 모두 연결했다. 운영 값·정책 확인이 남은 항목은 [API_INTEGRATION_GAPS.md](API_INTEGRATION_GAPS.md)에 정리했다.

## 근거

- [사용자 제공 백엔드 전환 가이드](.claude/spec/BACKEND_API_MIGRATION_GUIDE.md)
- [갱신한 OpenAPI](.claude/spec/arca.openapi.json), [생성 타입](src/data/api/generated/types.gen.ts), [생성 검증기](src/data/api/generated/zod.gen.ts)
- [실제 API 호출부](src/data/api/arcaApi.ts), [응답 유실 처리](src/domain/commands/answerWriteCoordinator.ts)
- [기록 목록](src/domain/archive/archiveChains.ts), [모든 데이터 삭제](src/domain/deletion/allDataDelete.ts), [이벤트 큐](src/domain/analytics/analyticsQueue.ts)
