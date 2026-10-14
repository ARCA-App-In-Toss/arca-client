# ARCA 프론트엔드 API 전환 가이드

기준: 2026-10-14 백엔드 코드(`feat/19-product-event-collection` 브랜치), 계약 문서 `ARCA_API_RESPONSE_SPEC.md` 2.4.2.
대상: 프론트엔드가 정리한 `NEW_ARCA_API_RESPONSE_SPEC.md`(15개 엔드포인트, 명령/티켓 흐름 기준).

이 문서는 **지금 서버에 구현된 API**를 다룬다. MVP 계약의 엔드포인트 13개가 모두 구현되어 있다.
프론트 요구 문서는 계약 1.1.0(승객, 명령/티켓, 발췌) 기준으로 쓰여 있어 현재 서버와 많이 다르다.
각 절에 "현재 서버 형식"과 "프론트에서 바꿀 것"을 함께 적었다. 2026-10-13 판 이후 추가, 변경된 내용은 §5에 모았다.

---

## 1. 한눈에 보기

### 1.1 현재 구현된 엔드포인트

| 엔드포인트 | 허용 세션 | 성공 | 응답 |
|---|---|---|---|
| `POST /v1/sessions` | 인증 없음 | 201 | `SessionResponse` |
| `GET /v1/consent-policies` | `GUEST`, `ACTIVE` | 200 | `ConsentPoliciesResponse` |
| `POST /v1/members` | `GUEST` (`ACTIVE`는 409) | 201 | `SessionResponse` (새 `ACTIVE` 토큰) |
| `GET /v1/members/me` | `ACTIVE` (`GUEST`는 404) | 200 | `MemberProfile` |
| `PUT /v1/members/me/nickname` | `ACTIVE` | 200 | `MemberProfile` |
| `GET /v1/semas/today` | `ACTIVE` | 200 | `TodaySemaResponse` |
| `POST /v1/answers` | `ACTIVE` | 201 | `SaveAnswerResult` |
| `PUT /v1/answers/{answerId}` | `ACTIVE` | 200 | `SaveAnswerResult` |
| `DELETE /v1/answers/{answerId}` | `ACTIVE` | 200 | `DeleteAnswerResult` |
| `GET /v1/answers?cursor=` | `ACTIVE` | 200 | `AnswerPage` |
| `GET /v1/answers/{answerId}` | `ACTIVE` | 200 | `AnswerDetail` |
| `DELETE /v1/members/me` | `ACTIVE` | 204 | body 없음 |
| `POST /v1/analytics/event-batches` | `GUEST`, `ACTIVE` | 202 | body 없음 |

### 1.2 프론트 요구 15개 엔드포인트의 현재 대응

| 프론트 요구 (OP) | 현재 서버 | 조치 |
|---|---|---|
| OP-001 `POST /v1/sessions` | 같은 경로 | 응답 형식 변경 (§3.1) |
| OP-002 `GET /v1/passenger` | `GET /v1/members/me` | 경로, 타입, 오류 코드 변경 (§3.4) |
| OP-003 `POST /v1/passenger` | `POST /v1/members` | 경로, 요청 헤더, 응답, 오류 변경 (§3.3) |
| OP-004 `PUT /v1/passenger/nickname` | `PUT /v1/members/me/nickname` | 요청 body, 응답, 오류 변경 (§3.5) |
| OP-005 `GET /v1/today` | `GET /v1/semas/today` | 경로, 응답 형식 변경 (§3.6) |
| OP-006 `POST /v1/answer-write-commands` (CREATE) | `POST /v1/answers` | 명령 흐름 제거, 직접 저장 (§3.7) |
| OP-006 `POST /v1/answer-write-commands` (UPDATE) | `PUT /v1/answers/{answerId}` | 명령 흐름 제거, 직접 수정 (§3.8) |
| OP-007 `PUT /v1/commands/{ticketId}/execution` | 없음 | **삭제**. 위 엔드포인트가 바로 적용한다 |
| OP-008 `GET /v1/commands/{ticketId}` | 없음 | **삭제**. 결과는 리소스를 다시 조회해 확인한다 |
| OP-009 `PUT /v1/commands/{ticketId}/acknowledgement` | 없음 | **삭제** |
| OP-010 `GET /v1/answers` (목록) | 같은 경로 | cursor 규칙, 응답 형식 변경 (§3.10) |
| OP-011 `GET /v1/answers/{answerId}` (상세) | 같은 경로 | 응답 형식 변경 (§3.11) |
| OP-012 `POST /v1/answer-delete-commands` | `DELETE /v1/answers/{answerId}` | 명령 흐름 제거, 직접 삭제 (§3.9) |
| OP-013 `POST /v1/data-deletion-commands` | `DELETE /v1/members/me` | 명령 흐름 제거, 직접 삭제 (§3.12) |
| OP-014 `POST /v1/analytics/event-batches` | 같은 경로 | 속성 필수화, 길이 제한 (§3.13) |
| OP-015 `PUT /v1/commands/{ticketId}/closure` | 없음 | **삭제** |
| (신규) | `GET /v1/consent-policies` | 가입 전 정책 목록 조회 (§3.2) |

---

## 2. 공통 변경 (transport, 검증 레이어)

### 2.1 그대로인 것

- 주소: `${VITE_ARCA_API_BASE}/v1`
- 인증: 세션 교환을 뺀 모든 요청에 `Authorization: Bearer <accessToken>`. `Bearer`는 대소문자를 구분하지 않는다
- 성공 응답은 DTO를 그대로 반환한다. `{ "data": ... }`로 감싸지 않는다
- 성공, 오류 응답 모두 `Cache-Control: no-store`
- 오류 envelope은 `{ "error": { "code", "category", "requestId", ... } }`이다. 자유 형식 `message`, `details`는 없다

### 2.2 바꿀 것

1. **명령/티켓 흐름 전체 제거.** 준비 → 실행 → 결과 조회 → 확인 → 종료 단계가 없다. 요청 하나가 트랜잭션 하나이고, 성공 응답을 받으면 이미 반영된 상태다.
   - `ticketId`, `operationId`, `kind`, `target`, `state(PREPARED/EXECUTING/...)`, `proof`, `presentation`, `reconciliation`, `executeBy`, `resultExpiresAt`을 다루는 타입, Zod 검증기, 상태 머신을 지운다.
2. **`Idempotency-Key` 헤더 제거.** 서버는 이 헤더를 쓰지 않는다. 같은 요청의 재전송은 각 엔드포인트의 "응답을 못 받았을 때" 항목대로 처리한다.
3. **용어 변경.** passenger → member.

   | 이전 | 현재 |
   |---|---|
   | `PRE_PASSENGER` | `GUEST` |
   | `PassengerProfile` | `MemberProfile` |
   | `passengerCode` | `memberCode` |
   | `context.passenger` | `context.member` |
   | `PASSENGER_NOT_FOUND` | `MEMBER_NOT_FOUND` |
   | `PASSENGER_ALREADY_EXISTS` | `MEMBER_ALREADY_EXISTS` |

4. **세션 mode는 `GUEST`, `ACTIVE` 둘뿐이다.** `DELETION_RECOVERY`와 `recentDeletion`, `dataGeneration`, `deletionTicketId`는 없다.
5. **revision 제거.** 회원 profile과 답변 모두 revision이 없다. `Revision` 타입, `expectedRevision` 입력, `REVISION_CONFLICT` 처리를 지운다. 다른 기기에서 동시에 바꾸면 나중 요청이 남는다.
6. **발췌(excerpt)와 availability 래퍼 제거.** `excerptProfile` 쿼리, `Excerpt`, `ExcerptAvailability`, `CountAvailability`, `CountSnapshot.observedAt`, `UNAVAILABLE/retryable`이 없다. 본문은 원문 전체로 오고, 말줄임은 클라이언트가 레이아웃에서 처리한다. 활성 답변 수는 `{ count }`다.
7. **질문/SEMA 버전과 질문 역할 제거.** `QuestionSnapshot` → `Question { questionId, text }`. `version`, `role`, `semaVersion`이 없다. 기본/대체 구분은 오늘 조회의 `primaryQuestion`, `alternateQuestion` 키로 한다.
8. **요청 body는 엄격하다.** 계약에 없는 필드를 보내면 `400 INVALID_REQUEST`다. 예전 필드(`expectedRevision`, `semaVersion`, `questionVersion`, 질문 원문 등)를 남기지 말 것.
9. **null과 생략.**
   - nullable 필드는 생략하지 않고 `null`로 보낸다 (`member.nickname`, GUEST 세션의 `context.member`).
   - 예외는 셋이다. 미응답일 때 오늘 조회의 `answer.value`, 오류의 `recovery`, `retryAfterSeconds`는 해당 없으면 **생략**한다.
10. **ID는 opaque 문자열.** 지금은 숫자 문자열이다. `answerId` 경로에 숫자가 아닌 값을 넣으면 `400 INVALID_REQUEST`다.
11. **시각, 날짜.** 시각은 UTC `Z`로 끝나는 RFC 3339 문자열이다. 소수 초가 붙을 수 있다 (`2026-10-13T05:00:00.123456Z`). KST 날짜는 `YYYY-MM-DD`다.

### 2.3 응답을 못 받았을 때 (명령 흐름을 대신하는 규칙)

통신 실패, timeout으로 성공 여부를 모르면 리소스를 다시 조회해 확인한다. 서버에는 결과 보관소가 없다.

| 요청 | 확인 방법 |
|---|---|
| 회원 가입 | 같은 요청을 다시 보내지 않는다. 세션을 다시 교환해 `ACTIVE`면 가입된 것이다 (재전송하면 GUEST 토큰이 폐기돼 `401 SESSION_RECOVERY_REQUIRED`) |
| 닉네임 변경 | 같은 body로 다시 보내도 된다 (같은 닉네임 재설정도 성공) |
| 답변 작성 | 오늘 조회의 `answer.state`로 확인한다. 다시 보내 `409 ANSWER_ALREADY_EXISTS`가 오면 이미 저장된 것이다 |
| 답변 수정 | 같은 body로 다시 보내도 된다 |
| 답변 삭제 | 다시 보내 `404 ANSWER_NOT_FOUND`가 오면 이미 지워진 것이다. 기록 목록이나 오늘 재조회로도 확인할 수 있다 |
| 모든 데이터 삭제 | 같은 요청을 다시 보내지 않는다. 세션을 다시 교환해 `GUEST`면 삭제된 것이다 (재전송하면 토큰이 폐기돼 `401 SESSION_RECOVERY_REQUIRED`) |
| 이벤트 batch | 같은 body(같은 `eventId`)로 다시 보내도 된다. 서버가 `eventId`로 중복을 제거한다 |

`500 INTERNAL_ERROR`, `500 DATABASE_ERROR`를 받았을 때도 결과를 추정하지 말고 위 방법으로 확인한다.

### 2.4 중복 제출 방지 (필수)

**답변 작성, 회원 가입, 모든 데이터 삭제 버튼은 요청이 끝날 때까지 비활성화한다.**
서버는 동시 중복 요청을 따로 막지 않는다.

| 요청 | 거의 동시에 두 번 처리되면 | 순서대로 도착한 중복 |
|---|---|---|
| 회원 가입 | 하나만 성공, 진 요청은 `500 DATABASE_ERROR` | `409 MEMBER_ALREADY_EXISTS` 또는 `401 SESSION_RECOVERY_REQUIRED` |
| 답변 작성 | 하나만 저장, 진 요청은 `500 DATABASE_ERROR` | `409 ANSWER_ALREADY_EXISTS` |
| 모든 데이터 삭제 | 하나만 성공, 진 요청은 `404 MEMBER_NOT_FOUND` 또는 `500 DATABASE_ERROR` | `401 SESSION_RECOVERY_REQUIRED` |

모든 데이터 삭제 도중 같은 회원의 답변 작성이 끼면 둘 중 하나가 `500 DATABASE_ERROR`로 끝나고 그 요청은 통째로 취소된다. 일부만 지워진 상태는 생기지 않는다.

---

## 3. 엔드포인트별 명세와 전환 방법

### 3.1 세션 교환 `POST /v1/sessions`

**요청** (인증 없음)

```json
{ "anonymousKey": "<앱인토스 익명 키>" }
```

**응답 201** `SessionResponse`

```json
{
  "accessToken": "opaque-token",
  "expiresAt": "2026-10-14T05:00:00Z",
  "context": {
    "mode": "ACTIVE",
    "member": { "memberCode": "ARCA-7K2QX", "nickname": "달빛" }
  }
}
```

- 연결된 회원이 없으면 `{ "mode": "GUEST", "member": null }`이다.
- 토큰 유효 기간은 24시간이다. 다시 교환하면 새 토큰이 나오고, 이전 토큰도 만료까지 유효하다.

**프론트에서 바꿀 것**

- `consentPolicies`를 응답에서 빼고, 정책 목록은 §3.2로 따로 받는다.
- `recentDeletion`, `context.dataGeneration`, `context.deletionTicketId`, `DELETION_RECOVERY` 분기를 지운다.
- `context.passenger` → `context.member`, `PRE_PASSENGER` → `GUEST`.

**오류**

| 상황 | HTTP | code |
|---|---|---|
| `anonymousKey` 누락, 빈 문자열, 추가 필드 | 400 | `INVALID_REQUEST` |
| 앱인토스가 키를 무효로 판정 | 401 | `ANONYMOUS_KEY_INVALID` |
| 앱인토스 검증 서버 장애 | 503 | `MAINTENANCE` |

> 현재 개발 서버는 앱인토스 검증 대신 스텁을 써서 모든 키를 통과시킨다. `ANONYMOUS_KEY_INVALID`와 위 `MAINTENANCE`는 운영 검증기를 붙인 뒤부터 발생한다.

### 3.2 정책 목록 조회 `GET /v1/consent-policies` (신규)

허용 세션: `GUEST`, `ACTIVE`

**응답 200**

```json
{
  "consentPolicies": [
    { "policyId": "terms-of-service", "version": "1", "title": "서비스 이용약관", "url": "https://arca.invalid/policies/terms-of-service/1", "required": true },
    { "policyId": "privacy-policy", "version": "1", "title": "개인정보처리방침", "url": "https://arca.invalid/policies/privacy-policy/1", "required": true }
  ]
}
```

- `ConsentPolicy` 타입은 예전과 같다.
- URL은 법무 확정 전 가정값이다(예약 도메인 `.invalid`).

**프론트에서 바꿀 것:** 약관 동의 화면에 들어갈 때 이 API로 목록을 받는다. 세션 교환, 가입 응답에는 정책 목록이 없다.

### 3.3 회원 가입 `POST /v1/members` (이전 `POST /v1/passenger`)

허용 세션: `GUEST`. `ACTIVE` 세션은 403이 아니라 `409 MEMBER_ALREADY_EXISTS`다.

**요청**

```json
{
  "consents": [
    { "policyId": "terms-of-service", "version": "1", "agreed": true },
    { "policyId": "privacy-policy", "version": "1", "agreed": true }
  ]
}
```

**응답 201** `SessionResponse` (§3.1과 같은 형식, `context.mode`는 `ACTIVE`, `member.nickname`은 `null`)

- 성공 응답은 201 하나뿐이다. 같은 요청 재전송에 200을 주는 동작은 없다.
- **가입에 쓴 GUEST 토큰은 폐기된다.** 응답의 `accessToken`으로 저장된 토큰을 즉시 교체한다.

**프론트에서 바꿀 것**

- 경로를 `/v1/members`로 바꾸고 `Idempotency-Key`를 뺀다.
- 응답에서 `consentPolicies`, `recentDeletion`, `dataGeneration`을 뺀다.
- `IDEMPOTENCY_KEY_REUSED` 처리를 지운다.
- 가입 버튼은 요청이 끝날 때까지 비활성화한다 (§2.4).

**오류** (판정 순서대로)

| 상황 | HTTP | code |
|---|---|---|
| 동의 목록이 비었거나 `agreed`가 `true`가 아님, 형식 오류, 추가 필드 | 400 | `INVALID_REQUEST` |
| `ACTIVE` 세션, 또는 이 익명 키에 이미 회원이 있음 | 409 | `MEMBER_ALREADY_EXISTS` |
| 모르는 정책 ID나 다른 버전이 섞임 | 422 | `POLICY_VERSION_CHANGED` + `recovery: { kind: "REFRESH_POLICIES", policies: ConsentPolicy[] }` |
| 필수 정책 누락 | 422 | `CONSENT_REQUIRED` |
| 동시 중복 제출에서 짐 | 500 | `DATABASE_ERROR` |

### 3.4 회원 정보 조회 `GET /v1/members/me` (이전 `GET /v1/passenger`)

허용 세션: `ACTIVE`. `GUEST`는 403이 아니라 항상 `404 MEMBER_NOT_FOUND`다.

**응답 200** `MemberProfile`

```json
{ "memberCode": "ARCA-7K2QX", "nickname": null }
```

**프론트에서 바꿀 것:** `revision` 필드를 지우고, `passengerCode` → `memberCode`, `PASSENGER_NOT_FOUND` → `MEMBER_NOT_FOUND`.

### 3.5 닉네임 설정, 해제 `PUT /v1/members/me/nickname` (이전 `PUT /v1/passenger/nickname`)

허용 세션: `ACTIVE`

**요청**

```json
{ "nickname": "달빛" }
```

- 해제는 `{ "nickname": null }`이다. 필드를 생략하면 `400 INVALID_REQUEST`다.
- `expectedRevision`을 보내면 추가 필드라 `400`이다.

**응답 200** `MemberProfile` (§3.4와 같은 형식, 바뀐 뒤의 값)

**프론트에서 바꿀 것**

- 응답이 `NicknameReceipt { operationId, profile, resultExpiresAt }`에서 `MemberProfile` 자체로 바뀌었다. `response.profile` 대신 `response`를 쓴다.
- `Idempotency-Key`와 `expectedRevision`을 뺀다.
- 아래 오류 처리를 지운다: `REVISION_CONFLICT`, `COMMAND_ALREADY_PENDING`, `IDEMPOTENCY_KEY_REUSED`, `OPERATION_RESULT_EXPIRED`.

**오류**

| 상황 | HTTP | code |
|---|---|---|
| `nickname` 필드 누락, 추가 필드 | 400 | `INVALID_REQUEST` |
| 닉네임 규칙 위반 | 422 | `NICKNAME_INVALID` |

닉네임 규칙은 예전과 같다.
- 앞뒤 공백을 제거한 뒤 확장 grapheme 기준 2~12자여야 한다.
- 줄바꿈, 제어 문자, 보이지 않는 문자는 거절한다.
- 공백 제거 후 UTF-16 길이 255를 넘으면 거절한다.
- 같은 닉네임으로 다시 설정해도 성공한다.

### 3.6 오늘의 SEMA 조회 `GET /v1/semas/today` (이전 `GET /v1/today`)

허용 세션: `ACTIVE`. 쿼리 파라미터 없음.

**응답 200** `TodaySemaResponse`

```json
{
  "dateKst": "2026-10-13",
  "sema": {
    "dailySemaId": "2026-10-13",
    "semaId": "10",
    "semaCode": "FAKE-13",
    "dateKst": "2026-10-13",
    "primaryQuestion": { "questionId": "11", "text": "오늘 가장 오래 머문 생각은 무엇이었나요?" },
    "alternateQuestion": { "questionId": "12", "text": "오늘 가장 자주 떠오른 장면은 무엇이었나요?" }
  },
  "answer": { "state": "UNANSWERED" },
  "activeAnswerCount": { "count": 0 }
}
```

답변이 있으면 `answer`는 아래와 같다. `value`는 `AnswerDetail`(§4)이고 원문 전체를 담는다.

```json
{
  "state": "ANSWERED",
  "value": {
    "answerId": "1",
    "dailySemaId": "2026-10-13",
    "semaId": "10",
    "semaCode": "FAKE-13",
    "createdAt": "2026-10-13T05:00:00Z",
    "updatedAt": "2026-10-13T05:00:00Z",
    "createdDateKst": "2026-10-13",
    "isEdited": false,
    "question": { "questionId": "12", "text": "오늘 가장 자주 떠오른 장면은 무엇이었나요?" },
    "content": "  오늘의 기록"
  }
}
```

- 같은 날짜에는 모든 회원이 같은 SEMA를 받는다. `dailySemaId`는 지금은 KST 날짜 문자열이지만 해석하지 않는다.
- SEMA가 예비로 교체돼도 `answer.value`는 **답변한 SEMA와 질문**을 그대로 보여준다. 그래서 `value.semaId`가 `sema.semaId`와 다를 수 있다.
- `activeAnswerCount.count`는 지난 날짜를 포함해 지금 남아 있는 답변 수다.

**프론트에서 바꿀 것**

- 경로 `/v1/today` → `/v1/semas/today`, `excerptProfile` 쿼리 제거.
- `sema.version`, `QuestionSnapshot.version`, `QuestionSnapshot.role`을 지운다. 질문 타입은 `{ questionId, text }`다.
- `answer.value`를 `ExcerptAnswer`에서 `AnswerDetail`로 바꾼다. 차이는 아래와 같다.
  - `excerpt` 대신 `content`(원문 전체)가 온다.
  - `revision`, `semaVersion`이 없다.
- `activeAnswerCount`를 `CountAvailability` 대신 `{ count }`로 받는다. `UNAVAILABLE` 분기를 지운다.

**오류**

| 상황 | HTTP | code |
|---|---|---|
| `GUEST` 세션 | 403 | `SESSION_SCOPE_INSUFFICIENT` |
| 오늘 편성된 SEMA가 없음 (운영상 발생하지 않는 전제) | 503 | `SEMA_NOT_FOUND` (category `MAINTENANCE`) |

### 3.7 답변 작성 `POST /v1/answers` (이전 OP-006 CREATE + OP-007)

허용 세션: `ACTIVE`

**요청**

```json
{
  "dailySemaId": "2026-10-13",
  "semaId": "10",
  "questionId": "12",
  "content": "  오늘의 기록"
}
```

- `dailySemaId`, `semaId`, `questionId`는 오늘 조회 응답의 값을 그대로 쓴다. `questionId`는 오늘 SEMA의 기본 또는 대체 질문 중 하나다.
- 질문 원문, `semaVersion`, `questionVersion`은 보내지 않는다. 보내면 `400`이다.
- 본문 규칙
  - trim하지 않고 그대로 저장한다. 공백만 있어도 유효하다.
  - 확장 grapheme 기준 1~2,000자다.
  - 코드 포인트 15,000개를 넘으면 안 된다. 결합 문자를 비정상적으로 이어 붙인 입력을 막는 상한이다.

**응답 201** `SaveAnswerResult`

```json
{
  "answer": { "...": "AnswerDetail (§4)" },
  "activeAnswerCount": { "count": 1 }
}
```

**오류** (판정 순서대로)

| 상황 | HTTP | code |
|---|---|---|
| 필드 누락, 빈 ID, 추가 필드 | 400 | `INVALID_REQUEST` |
| `dailySemaId`가 서버의 오늘(KST)이 아님 | 422 | `DATE_CHANGED` + `recovery: { kind: "REFRESH_TODAY" }` |
| 오늘 편성된 SEMA가 없음 | 503 | `SEMA_NOT_FOUND` |
| `semaId`가 오늘 SEMA가 아니거나, 질문이 오늘 SEMA의 질문이 아님 | 422 | `SEMA_REPLACED` + `recovery: { kind: "REFRESH_TODAY" }` |
| 오늘 답변이 이미 있음 | 409 | `ANSWER_ALREADY_EXISTS` |
| 본문 규칙 위반 | 422 | `ANSWER_CONTENT_INVALID` |
| 동시 중복 제출에서 짐 | 500 | `DATABASE_ERROR` |

**프론트에서 바꿀 것**

- 명령 준비, 실행, 결과 폴링을 `POST /v1/answers` 한 번으로 바꾼다. `201`을 받으면 저장 완료다.
- `ANSWER_CONTENT_INVALID`는 이제 **HTTP 422 오류**다. 예전처럼 `NOT_APPLIED.error`로 오지 않는다.
- `REFRESH_TODAY`면 오늘 조회를 다시 불러 사용자가 새 질문으로 다시 쓰게 한다.
- 오늘 답변을 지운 뒤 같은 KST 날짜면 다시 작성할 수 있다.
- 작성 버튼은 요청이 끝날 때까지 비활성화한다 (§2.4).

### 3.8 답변 수정 `PUT /v1/answers/{answerId}` (이전 OP-006 UPDATE + OP-007)

허용 세션: `ACTIVE`

**요청**

```json
{ "content": "고쳐 쓴 기록" }
```

**응답 200** `SaveAnswerResult` (§3.7과 같은 형식)

- 과거 날짜 답변도 수정할 수 있다. 날짜, SEMA는 검사하지 않는다.
- 질문, SEMA, `createdAt`, `createdDateKst`는 유지된다. `updatedAt`이 바뀌고 `isEdited`가 `true`가 된다.
- 같은 본문으로 다시 수정해도 성공한다.

**오류** (판정 순서대로)

| 상황 | HTTP | code |
|---|---|---|
| 숫자가 아닌 `answerId`, `content` 누락, 추가 필드(`expectedRevision` 포함) | 400 | `INVALID_REQUEST` |
| 답변 없음, 이미 삭제, 다른 회원의 답변 (구분하지 않음) | 404 | `ANSWER_NOT_FOUND` |
| 본문 규칙 위반 | 422 | `ANSWER_CONTENT_INVALID` |

**프론트에서 바꿀 것:** `target.mode: UPDATE`, `expectedRevision`, `REVISION_CONFLICT`, `RESOURCE_CHANGED` 처리를 지운다.

### 3.9 답변 삭제 `DELETE /v1/answers/{answerId}` (이전 OP-012 + OP-007)

허용 세션: `ACTIVE`. 쿼리, body 없음.

**응답 200** `DeleteAnswerResult`

```json
{ "activeAnswerCount": { "count": 0 } }
```

- 되돌리기는 없다.

**오류**

| 상황 | HTTP | code |
|---|---|---|
| 숫자가 아닌 `answerId` | 400 | `INVALID_REQUEST` |
| 답변 없음, 이미 삭제, 다른 회원의 답변 | 404 | `ANSWER_NOT_FOUND` |

**프론트에서 바꿀 것**

- 이미 지워진 답변은 예전의 `SUCCEEDED + proof.effect: ALREADY_ABSENT`가 아니라 `404 ANSWER_NOT_FOUND`다. 재전송에서 404가 오면 삭제된 것으로 처리한다.
- `expectedRevision`과 `REVISION_CONFLICT` 처리를 지운다.

### 3.10 기록 목록 조회 `GET /v1/answers` (OP-010)

허용 세션: `ACTIVE`

**요청 query**

| 이름 | 필수 | 설명 |
|---|---|---|
| `cursor` | 아니오 | 첫 요청은 생략한다. 이후 직전 응답의 `nextCursor`를 그대로 보낸다 |

**응답 200** `AnswerPage`

```json
{
  "items": [
    {
      "answerId": "42",
      "dailySemaId": "2026-10-13",
      "semaId": "10",
      "semaCode": "FAKE-13",
      "createdAt": "2026-10-13T05:00:00Z",
      "updatedAt": "2026-10-13T05:00:00Z",
      "createdDateKst": "2026-10-13",
      "isEdited": false,
      "question": { "questionId": "12", "text": "오늘 가장 자주 떠오른 장면은 무엇이었나요?" }
    }
  ],
  "nextCursor": "42"
}
```

- 빈 목록은 `{ "items": [], "nextCursor": null }`이다. 마지막 페이지는 `nextCursor: null`이다.
- 한 페이지는 최대 20개이고 최신순(`answerId` 내림차순)이다. 회원당 하루 1개라 작성 시각 내림차순과 같다.
- 항목은 `AnswerSummary`(§4)로 **본문이 없다.** 본문은 기록 상세(§3.11)로 받는다.
- 다음 페이지는 마지막으로 받은 답변보다 먼저 쓴 답변이다.
  - 이어 보는 중에 새로 쓴 답변은 끼지 않는다. 새로고침(첫 페이지 재조회)하면 보인다.
  - 이미 받은 답변을 지워도 다음 페이지에서 빠지는 항목이 없다. 마지막으로 받은 답변을 지워도 그 `nextCursor`는 그대로 쓸 수 있다.
- cursor는 지금은 마지막 `answerId`지만 해석하거나 직접 만들지 않는다. 서명, 만료가 없으므로 오래된 cursor도 쓸 수 있다.

**오류**

| 상황 | HTTP | code |
|---|---|---|
| cursor 형식 오류 (빈 문자열, 숫자가 아님, 1 미만) | 400 | `CURSOR_INVALID` → 첫 페이지부터 다시 |
| `GUEST` 세션 | 403 | `SESSION_SCOPE_INSUFFICIENT` |

**프론트에서 바꿀 것**

- `excerptProfile` 쿼리를 뺀다. 보내도 무시되지만 남기지 않는다.
- `items`를 `ExcerptAnswer[]`에서 `AnswerSummary[]`로 바꾼다. `excerpt`, `revision`, `semaVersion`이 없다. 목록 카드에 본문 미리보기가 필요하면 상세를 따로 불러야 한다.
- `pageSnapshotAt`을 지운다.
- `CURSOR_INVALID`는 형식 오류에만 온다. 다른 회원, 변조, 만료 cursor를 가정한 분기는 필요 없다.

### 3.11 기록 상세 조회 `GET /v1/answers/{answerId}` (OP-011)

허용 세션: `ACTIVE`

**응답 200** `AnswerDetail` (§4. 오늘 조회의 `answer.value`, 작성/수정 응답의 `answer`와 같은 형식)

```json
{
  "answerId": "42",
  "dailySemaId": "2026-10-13",
  "semaId": "10",
  "semaCode": "FAKE-13",
  "createdAt": "2026-10-13T05:00:00Z",
  "updatedAt": "2026-10-14T03:00:00Z",
  "createdDateKst": "2026-10-13",
  "isEdited": true,
  "question": { "questionId": "12", "text": "오늘 가장 자주 떠오른 장면은 무엇이었나요?" },
  "content": "  고쳐 쓴 기록"
}
```

- `content`는 저장된 원문 그대로다. 서버는 자르지 않는다.
- `question`은 답변한 질문이다.

**오류**

| 상황 | HTTP | code |
|---|---|---|
| 숫자가 아닌 `answerId` | 400 | `INVALID_REQUEST` |
| `GUEST` 세션 | 403 | `SESSION_SCOPE_INSUFFICIENT` |
| 답변 없음, 삭제됨, 다른 회원의 답변 (구분하지 않음) | 404 | `ANSWER_NOT_FOUND` → 기록 목록으로 복귀 |

**프론트에서 바꿀 것:** `revision`, `semaVersion`, `QuestionSnapshot.version`/`role`을 지운다. 질문 타입은 `{ questionId, text }`다.

### 3.12 모든 데이터 삭제 `DELETE /v1/members/me` (이전 OP-013 + OP-007)

허용 세션: `ACTIVE`. 쿼리, body 없음.

**응답 204** body 없음.

- 한 트랜잭션으로 지운다. 실패하면 아무것도 지워지지 않는다.

  | 대상 | 처리 |
  |---|---|
  | 답변, 회원 profile, 활성 동의 연결 | 삭제 |
  | 제품 이벤트 (가입 전 `GUEST`로 보낸 것 포함) | 삭제 |
  | 동의 증빙 | 법적 보존을 위해 별도 저장소에 1년 보존 (조회 불가) |

- **성공하면 그 회원의 모든 세션이 폐기된다.** 이후 기존 토큰은 `401 SESSION_RECOVERY_REQUIRED`다. 세션을 다시 교환하면 `GUEST`다.
- 같은 익명 키로 다시 가입하면 새 회원(새 `memberCode`)이 생기고 이전 데이터와 합쳐지지 않는다. 로컬 저장 영역을 `memberCode`로 나눠 두면 섞이지 않는다.

**오류**

| 상황 | HTTP | code |
|---|---|---|
| `GUEST` 세션 | 403 | `SESSION_SCOPE_INSUFFICIENT` |
| 이미 삭제되어 토큰이 폐기됨 (재전송) | 401 | `SESSION_RECOVERY_REQUIRED` → 재교환해 `GUEST`면 삭제된 것 |
| 같은 토큰의 삭제가 동시에 옴 (진 쪽) | 404 / 500 | `MEMBER_NOT_FOUND` / `DATABASE_ERROR` |
| 삭제 트랜잭션 실패 | 500 | `INTERNAL_ERROR` / `DATABASE_ERROR` → 데이터는 그대로. 재교환 결과 mode로 확인 |

**프론트에서 바꿀 것**

- 준비(`POST /v1/data-deletion-commands`) → 실행 → 결과 조회 → 확인 → 종료를 `DELETE /v1/members/me` 한 번으로 바꾼다. `204`를 받으면 삭제 완료다.
- `DELETION_RECOVERY` mode, `recentDeletion`, `deletionTicketId`, `AllDataDeleteReceipt` 처리를 지운다.
- `ALL_DATA_DELETE_FAILED`(`NOT_APPLIED.error`)는 없다. 실패는 `500`이다.
- `204`를 받으면 저장된 토큰과 회원 로컬 데이터를 지우고 세션을 다시 교환해 `GUEST` 흐름으로 보낸다.
- 삭제 버튼은 요청이 끝날 때까지 비활성화한다 (§2.4).

### 3.13 제품 이벤트 전송 `POST /v1/analytics/event-batches` (OP-014)

허용 세션: `GUEST`, `ACTIVE`

**요청**

```json
{
  "events": [
    {
      "eventId": "66d9e9af-2026-4000-8000-000000000003",
      "schemaVersion": 1,
      "name": "answer_save_failed",
      "occurredAt": "2026-10-13T14:59:00Z",
      "properties": {
        "mode": "CREATE",
        "certainty": "UNKNOWN",
        "reasonCode": "NETWORK_UNCONFIRMED"
      }
    }
  ],
  "appVersion": "1.0.0",
  "platform": "IOS"
}
```

| 필드 | 필수 | 규칙 |
|---|---|---|
| `events` | 예 | 1~20개 |
| `events[].eventId` | 예 | UUID. 중복 제거 키 |
| `events[].schemaVersion` | 예 | `1` 고정 |
| `events[].name` | 예 | 아래 표의 이름만 |
| `events[].occurredAt` | 예 | 클라이언트 관찰 시각 (`Instant`) |
| `events[].properties` | 예 | 이름별 속성. **허용 속성은 모두 필수**이고 남는 속성도 안 된다. 속성이 없는 이벤트는 `{}` |
| `appVersion` | 아니오 | 최대 50자 |
| `platform` | 아니오 | `IOS` \| `ANDROID` |

모든 객체에 추가 필드를 넣으면 400이다.

| name | properties |
|---|---|
| `onboarding_started` | `{}` |
| `onboarding_skipped` | `{}` |
| `today_sema_viewed` | `answerState`: `UNANSWERED` \| `ANSWERED` |
| `alternate_question_viewed` | `{}` |
| `sema_question_changed` | `from`, `to`: `PRIMARY` \| `ALTERNATE` |
| `answer_started` | `mode`: `CREATE` \| `UPDATE` |
| `answer_save_failed` | `mode`: `CREATE` \| `UPDATE`, `certainty`: `REJECTED` \| `UNKNOWN`, `reasonCode`: `VALIDATION_REJECTED` \| `DATE_CHANGED` \| `CONTENT_REPLACED` \| `CONFLICT` \| `NETWORK_UNCONFIRMED` \| `SERVER_UNAVAILABLE` \| `PROTOCOL_UNCONFIRMED` |
| `archive_viewed` | `state`: `EMPTY` \| `NON_EMPTY` |

- `certainty`: 서버가 오류 응답으로 거절했으면 `REJECTED`, 응답을 못 받았거나 500이면 `UNKNOWN`이다.
- 서버가 직접 기록하는 이벤트는 보내지 않는다. 보내면 batch 전체가 400이다: `onboarding_completed`, `answer_saved`, `answer_edited`, `answer_deleted`, `all_data_deleted`.

**응답 202** body 없음.

- 분석 주체는 세션에서 서버가 정한다. 익명 키, 회원 코드를 보내지 않는다. 가입 전 `GUEST` 이벤트와 가입 뒤 `ACTIVE` 이벤트는 같은 주체다.
- 같은 `eventId`는 한 번만 저장된다. 한 batch 안에 같은 `eventId`가 여럿이면 첫 번째만 저장하고 400이 아니다.
- best-effort다. 실패해도 화면 기능을 막지 않는다.

**오류**

| 상황 | HTTP | code |
|---|---|---|
| 모르는 이름, 서버 소유 이벤트, 속성 누락/추가/값 오류, 0개 또는 21개 이상, `schemaVersion` ≠ 1, `appVersion` 50자 초과 | 400 | `INVALID_REQUEST` (batch 전체 거절) |
| 같은 batch가 거의 동시에 두 번 처리됨 (진 쪽) | 500 | `DATABASE_ERROR` → 다시 보내면 중복 제거되어 202 |

**프론트에서 바꿀 것**

- `DELETION_RECOVERY` 세션 분기를 지운다.
- 이름별 속성을 **빠짐없이** 채운다. 일부만 보내면 batch 전체가 400이다.
- `appVersion`을 50자 이하로 보낸다.
- 400은 재전송해도 같은 결과이므로 그 batch를 버린다. 통신 실패나 500이면 같은 body로 다시 보내도 된다.

---

## 4. 현재 wire 타입 (TypeScript)

생성 타입과 Zod 검증기를 아래로 교체한다.

```ts
type EntityId = string;   // opaque, 비어 있지 않음 (현재 숫자 문자열)
type Instant = string;    // RFC 3339 UTC, 'Z'로 끝남, 소수 초 가능
type KstDate = string;    // YYYY-MM-DD

type SessionMode = 'GUEST' | 'ACTIVE';

type MemberProfile = {
  memberCode: string;          // 'ARCA-' + 대문자/숫자 5자
  nickname: string | null;
};

type SessionContext =
  | { mode: 'GUEST'; member: null }
  | { mode: 'ACTIVE'; member: MemberProfile };

type SessionResponse = {
  accessToken: string;
  expiresAt: Instant;
  context: SessionContext;
};

type ConsentPolicy = {
  policyId: string;
  version: string;
  title: string;
  url: string;
  required: boolean;
};

type ConsentPoliciesResponse = {
  consentPolicies: ConsentPolicy[];
};

type CreateMemberRequest = {
  consents: Array<{ policyId: string; version: string; agreed: true }>;
};

type UpdateNicknameRequest = {
  nickname: string | null;     // 생략 불가
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
  count: number;               // 0 이상 정수
};

type AnswerSummary = {         // 기록 목록 항목, 본문 없음
  answerId: EntityId;
  dailySemaId: EntityId;
  semaId: EntityId;
  semaCode: string;
  createdAt: Instant;
  updatedAt: Instant;
  createdDateKst: KstDate;
  isEdited: boolean;           // updatedAt !== createdAt
  question: Question;          // 답변한 질문
};

type AnswerDetail = AnswerSummary & {
  content: string;             // 원문 전체, trim 없음
};

type AnswerPage = {
  items: AnswerSummary[];      // 최대 20, 최신순
  nextCursor: string | null;   // opaque, 마지막 페이지면 null
};

type TodaySemaResponse = {
  dateKst: KstDate;
  sema: Sema;
  answer:
    | { state: 'UNANSWERED' }                      // value 필드 자체가 없음
    | { state: 'ANSWERED'; value: AnswerDetail };
  activeAnswerCount: AnswerCount;
};

type CreateAnswerRequest = {
  dailySemaId: EntityId;
  semaId: EntityId;
  questionId: EntityId;
  content: string;
};

type UpdateAnswerRequest = {
  content: string;
};

type SaveAnswerResult = {      // 작성 201, 수정 200
  answer: AnswerDetail;
  activeAnswerCount: AnswerCount;
};

type DeleteAnswerResult = {
  activeAnswerCount: AnswerCount;
};

// DELETE /v1/members/me: 204, body 없음

type ProductEvent =
  | { name: 'onboarding_started'; properties: {} }
  | { name: 'onboarding_skipped'; properties: {} }
  | { name: 'today_sema_viewed'; properties: { answerState: 'UNANSWERED' | 'ANSWERED' } }
  | { name: 'alternate_question_viewed'; properties: {} }
  | { name: 'sema_question_changed'; properties: { from: 'PRIMARY' | 'ALTERNATE'; to: 'PRIMARY' | 'ALTERNATE' } }
  | { name: 'answer_started'; properties: { mode: 'CREATE' | 'UPDATE' } }
  | {
      name: 'answer_save_failed';
      properties: {
        mode: 'CREATE' | 'UPDATE';
        certainty: 'REJECTED' | 'UNKNOWN';
        reasonCode:
          | 'VALIDATION_REJECTED' | 'DATE_CHANGED' | 'CONTENT_REPLACED' | 'CONFLICT'
          | 'NETWORK_UNCONFIRMED' | 'SERVER_UNAVAILABLE' | 'PROTOCOL_UNCONFIRMED';
      };
    }
  | { name: 'archive_viewed'; properties: { state: 'EMPTY' | 'NON_EMPTY' } };

type ProductEventEnvelope = ProductEvent & {
  eventId: string;             // UUID
  schemaVersion: 1;
  occurredAt: Instant;
};

type CreateEventBatchRequest = {
  events: ProductEventEnvelope[];  // 1~20
  appVersion?: string;             // 최대 50자
  platform?: 'IOS' | 'ANDROID';
};
// 응답: 202, body 없음
```

### 4.1 오류 envelope

```ts
type ErrorCategory = 'VALIDATION' | 'AUTH' | 'CONFLICT' | 'RATE_LIMIT' | 'MAINTENANCE';

type ApiErrorEnvelope = {
  error: {
    code: ErrorCode;
    category: ErrorCategory;
    requestId: string;
    recovery?: Recovery;           // 아래 code에만, 없으면 생략
    retryAfterSeconds?: number;    // RATE_LIMITED, MAINTENANCE에만, 없으면 생략
  };
};

type Recovery =
  | { kind: 'REESTABLISH_SESSION'; recoveryAllowed: true }        // SESSION_RECOVERY_REQUIRED
  | { kind: 'REFRESH_POLICIES'; policies: ConsentPolicy[] }       // POLICY_VERSION_CHANGED
  | { kind: 'REFRESH_TODAY' };                                    // DATE_CHANGED, SEMA_REPLACED
```

- `COMMAND_ALREADY_PENDING`의 `QUERY_COMMAND` recovery는 없어졌다.
- `retryAfterSeconds`를 보낼 때는 `Retry-After` 헤더와 같은 값이다.

### 4.2 오류 코드 전체 (현재 서버)

| code | HTTP | category | 발생 위치, 프론트 처리 |
|---|---|---|---|
| `INVALID_REQUEST` | 400 | VALIDATION | 형식 오류 전반. 요청 수정 |
| `ENDPOINT_NOT_FOUND` | 404 | VALIDATION | 없는 경로 (신규) |
| `METHOD_NOT_SUPPORTED` | 405 | VALIDATION | 경로는 있으나 메서드가 다름 (신규) |
| `MEDIA_TYPE_NOT_ACCEPTABLE` | 406 | VALIDATION | `Accept`가 JSON을 허용하지 않음 (신규) |
| `MEDIA_TYPE_NOT_SUPPORTED` | 415 | VALIDATION | `Content-Type`이 JSON이 아님 (신규) |
| `MEMBER_NOT_FOUND` | 404 | VALIDATION | `GUEST`로 회원 정보 조회, 모든 데이터 삭제 동시 요청에서 진 쪽 |
| `ANSWER_NOT_FOUND` | 404 | VALIDATION | 기록 상세, 답변 수정, 삭제 |
| `CURSOR_INVALID` | 400 | VALIDATION | 기록 목록 cursor 형식 오류. 첫 페이지부터 다시 |
| `CONSENT_REQUIRED` | 422 | VALIDATION | 가입 |
| `POLICY_VERSION_CHANGED` | 422 | VALIDATION | 가입. `recovery.policies`로 동의 화면 갱신 |
| `NICKNAME_INVALID` | 422 | VALIDATION | 닉네임 |
| `DATE_CHANGED` | 422 | VALIDATION | 답변 작성. 오늘 재조회 |
| `SEMA_REPLACED` | 422 | VALIDATION | 답변 작성. 오늘 재조회 |
| `ANSWER_CONTENT_INVALID` | 422 | VALIDATION | 답변 작성, 수정 |
| `ANONYMOUS_KEY_INVALID` | 401 | AUTH | 세션 교환 |
| `SESSION_INVALID` | 401 | AUTH | 토큰 없음, 형식 오류, 모르는 토큰. 자동 복구 대상 아님 |
| `SESSION_RECOVERY_REQUIRED` | 401 | AUTH | 만료, 폐기된 토큰. 세션 재교환 후 같은 요청 최대 1회 재시도 (가입 요청은 재시도하지 않음, §2.3) |
| `SESSION_SCOPE_INSUFFICIENT` | 403 | AUTH | 허용되지 않은 세션 mode |
| `MEMBER_ALREADY_EXISTS` | 409 | CONFLICT | 가입 |
| `ANSWER_ALREADY_EXISTS` | 409 | CONFLICT | 답변 작성 |
| `INTERNAL_ERROR` | 500 | MAINTENANCE | 예상하지 못한 서버 오류 |
| `DATABASE_ERROR` | 500 | MAINTENANCE | DB 오류 (신규). 동시 중복 제출에서 진 요청 포함(§2.4). `INTERNAL_ERROR`와 같이 처리 |
| `MAINTENANCE` | 503 | MAINTENANCE | 점검, 외부 검증 장애 |
| `SEMA_NOT_FOUND` | 503 | MAINTENANCE | 오늘 SEMA 없음 (신규) |
| `RATE_LIMITED` | 429 | RATE_LIMIT | 코드만 정의돼 있고 현재 서버는 발생시키지 않음 |

**지울 오류 코드:** `PASSENGER_NOT_FOUND`, `PASSENGER_ALREADY_EXISTS`(→ `MEMBER_*`), `REVISION_CONFLICT`, `COMMAND_ALREADY_PENDING`, `COMMAND_NOT_FOUND`, `COMMAND_PAYLOAD_MISMATCH`, `COMMAND_NOT_TERMINAL`, `COMMAND_CLOSED`, `COMMAND_EXPIRED`, `IDEMPOTENCY_KEY_REUSED`, `OPERATION_RESULT_EXPIRED`, `ALL_DATA_DELETE_FAILED`(→ `500 INTERNAL_ERROR`/`DATABASE_ERROR`).

### 4.3 세션 오류 판정 순서 (모든 인증 엔드포인트)

1. `Authorization` 헤더 없음, `Bearer` 형식 아님, 빈 토큰 → `401 SESSION_INVALID`
2. 서버가 발급한 적 없는 토큰 → `401 SESSION_INVALID`
3. 만료되었거나 폐기된 토큰 → `401 SESSION_RECOVERY_REQUIRED`
4. 허용되지 않은 세션 mode → `403 SESSION_SCOPE_INSUFFICIENT`

예외: `GET /v1/members/me`의 `GUEST`는 `404 MEMBER_NOT_FOUND`, `POST /v1/members`의 `ACTIVE`는 `409 MEMBER_ALREADY_EXISTS`다.

---

## 5. 2026-10-13 판 이후 바뀐 점

지난 판(계약 2.3.0, 9개 엔드포인트)을 이미 받았다면 아래만 확인하면 된다.

**새로 구현된 엔드포인트**

| 기능 | 경로 | 절 |
|---|---|---|
| 기록 목록 | `GET /v1/answers?cursor=` | §3.10 |
| 기록 상세 | `GET /v1/answers/{answerId}` | §3.11 |
| 모든 데이터 삭제 | `DELETE /v1/members/me` | §3.12 |
| 제품 이벤트 전송 | `POST /v1/analytics/event-batches` | §3.13 |

**계약 변경 (2.3.0 → 2.4.2)**

- 2.4.0 (목록, 호환 안 됨): 목록 응답에서 `pageSnapshotAt`을 뺐다. cursor는 서명, 만료가 없고 `CURSOR_INVALID`는 형식 오류에만 온다.
- 2.4.1 (호환): 모든 데이터 삭제의 동시 요청 결과를 정했다. 삭제 버튼도 요청 중 비활성화한다 (§2.4).
- 2.4.2 (호환): 이벤트 속성은 모두 필수, `appVersion` 최대 50자, batch 안 중복 `eventId`는 첫 번째만 저장. 가입 전 `GUEST` 이벤트도 모든 데이터 삭제 때 함께 지운다.

**오류 코드:** `CURSOR_INVALID`가 실제로 발생한다. `ALL_DATA_DELETE_FAILED`는 없어졌다(실패는 500).

---

## 6. 프론트 작업 체크리스트

**transport, 공통**
- [ ] `Idempotency-Key` 헤더 생성, 전송 제거
- [ ] 명령/티켓 API 클라이언트(OP-006~009, 012, 013, 015)와 결과 폴링, closure 로직 제거
- [ ] 오류 코드 registry를 §4.2로 교체, `QUERY_COMMAND` recovery 제거
- [ ] `DATABASE_ERROR`, `SEMA_NOT_FOUND`, `ENDPOINT_NOT_FOUND`, `METHOD_NOT_SUPPORTED`, `MEDIA_TYPE_*` 추가
- [ ] `ALL_DATA_DELETE_FAILED`, `COMMAND_*`, `IDEMPOTENCY_KEY_REUSED`, `OPERATION_RESULT_EXPIRED`, `REVISION_CONFLICT` 제거

**타입, Zod**
- [ ] passenger → member 이름 변경, mode `PRE_PASSENGER` → `GUEST`, `DELETION_RECOVERY` 제거
- [ ] `Revision`, `expectedRevision`, `revision` 필드 전부 제거
- [ ] `QuestionSnapshot` → `Question { questionId, text }`, `version`/`role`/`semaVersion` 제거
- [ ] `Excerpt*`, `CountAvailability`, `CountSnapshot` 제거, `AnswerCount { count }`로 교체
- [ ] `TodayReadModel.answer.value`를 `AnswerDetail`로 교체 (원문 `content`)
- [ ] `AnswerPage.items`를 `AnswerSummary[]`로 교체, `pageSnapshotAt` 제거
- [ ] `EstablishSessionResponse`, `CreatePassengerResponse` → `SessionResponse` (consentPolicies, recentDeletion, dataGeneration 제거)
- [ ] `NicknameReceipt` → `MemberProfile`
- [ ] 이벤트 타입을 §4 `ProductEvent`로 교체 (속성 전부 필수)

**화면, 흐름**
- [ ] 약관 동의 화면 진입 시 `GET /v1/consent-policies` 호출
- [ ] 가입 성공 시 응답 토큰으로 즉시 교체 (GUEST 토큰은 폐기됨)
- [ ] 오늘 화면 경로 `/v1/semas/today`, `excerptProfile` 제거, 말줄임은 클라이언트 레이아웃으로
- [ ] 답변 작성, 수정, 삭제를 단일 요청으로 전환, 성공 응답의 `activeAnswerCount`로 표시 갱신
- [ ] 기록 목록에서 `excerptProfile` 제거, 본문이 필요하면 상세 조회
- [ ] `CURSOR_INVALID`를 받으면 첫 페이지부터 다시 조회
- [ ] 모든 데이터 삭제를 `DELETE /v1/members/me` 한 번으로 전환, 204 뒤 토큰과 로컬 데이터 정리 후 세션 재교환
- [ ] 답변 작성, 회원 가입, 모든 데이터 삭제 버튼을 요청이 끝날 때까지 비활성화
- [ ] 응답 유실, 500 시 §2.3 규칙대로 재조회로 확인
- [ ] 이벤트 batch: 400이면 버리고, 통신 실패나 500이면 같은 body로 재전송
