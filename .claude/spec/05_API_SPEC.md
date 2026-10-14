# ARCA API 명세 — 백엔드 2.4.2 전환

기준: 2026-10-14 사용자 제공 `feat/19-product-event-collection` 구현 가이드(계약 2.4.2). 기존 1.1.0의 명령/티켓·revision·availability 계약은 현재 연결에 적용하지 않는다.

## 현재 계약 원본

- [백엔드 전환 가이드](BACKEND_API_MIGRATION_GUIDE.md): 구현된 API, 세션·검증·응답 유실 처리의 의미.
- [OpenAPI](arca.openapi.json): 위 가이드에서 현재 구현된 13개 endpoint의 wire 구조를 반영한 생성 원본. 실제 서버 OpenAPI export는 아직 제공되지 않았음.
- [루트 API 요약](../../API_RESPONSE_SPEC.md): endpoint·필수 응답·예외 코드.
- [화면 데이터 공백](../../API_INTEGRATION_GAPS.md): 서버 확인이 남은 데이터·정책·운영 보장.

## 연결 원칙

성공 응답은 DTO 자체다. 실패는 안정된 code/category/requestId envelope이며 사용자 입력과 자유 형식 오류를 UI·로그로 전달하지 않는다. 모든 응답은 no-store, 인증은 Bearer token이며 세션 mode는 GUEST/ACTIVE만 사용한다.

가입은 POST /members 한 번으로 처리하고 새 ACTIVE token을 즉시 반영한다. 가입 응답 유실 시 POST를 자동 재전송하지 않고 세션을 재교환한다. 정상 요청의 SESSION_RECOVERY_REQUIRED는 허용된 경우 한 번만 재교환·재시도한다.

답변은 직접 POST /answers, PUT/DELETE /answers/{answerId}로 처리한다. 성공 응답으로 현재 answer/count를 반영한다. timeout·네트워크·파싱 실패·5xx로 미적용을 단정하지 않는다. 작성은 오늘 조회로, 수정·삭제는 기록 상세 조회로 확인하고(상세 404면 삭제 완료), 확인되지 않으면 사용자의 명시적 재요청을 제공한다. 다른 기기의 다른 답변이 확인되면 작성 중인 글을 지우지 않는다.

기록 목록은 GET /answers의 opaque nextCursor로 이어 받는다. 항목은 본문 없는 AnswerSummary이며 본문은 GET /answers/{answerId}로 읽는다. CURSOR_INVALID는 첫 page부터 다시 읽는다.

모든 데이터 삭제는 DELETE /members/me 한 번이며 204면 완료다. 응답 유실·5xx면 DELETE를 재전송하지 않고 세션을 재교환해 GUEST면 삭제된 것으로, ACTIVE면 미적용으로 판정한다. 완료 뒤 GUEST 세션으로 시작 흐름을 다시 실행하며 이전 회원의 로컬 영역은 bootstrap이 정리한다.

제품 이벤트는 POST /analytics/event-batches로 최대 20개씩 best-effort 전송한다. 이름별 속성은 모두 채우고 appVersion은 50자 이하만 보낸다. 400 batch는 버리고 통신 실패·5xx는 같은 eventId로 재전송한다. 가입 전 GUEST 이벤트는 가입 뒤에도 같은 주체로 유지하고, 회원이 바뀌거나 삭제되면 이전 회원의 미전송 이벤트를 버린다.

Idempotency-Key·command·ticket·receipt·ack·closure·revision·버전·발췌 wrapper는 현재 계약에 없다. dataGeneration 대신 로컬 계정 scope를 쓰며 서버 generation으로 간주하지 않는다.

## 재현 검증

`node scripts/api-generate.mjs --check`와 계약/단위/브라우저 테스트로 생성물 일치·현재 wire·사용자 흐름을 검증한다. 원문·닉네임·익명 키·token은 URL·로그·분석·검증 artifact에 포함하지 않는다. 테스트는 합성값만 사용한다.
