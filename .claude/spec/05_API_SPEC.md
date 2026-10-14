# ARCA API 명세 — 백엔드 2.3.0 전환

기준: 2026-10-13 사용자 제공 `feat/16-answer` 구현 가이드. 기존 1.1.0의 명령/티켓·revision·availability 계약은 현재 연결에 적용하지 않는다.

## 현재 계약 원본

- [백엔드 전환 가이드](BACKEND_API_MIGRATION_GUIDE.md): 구현된 API, 세션·검증·응답 유실 처리의 의미.
- [OpenAPI](arca.openapi.json): 위 가이드에서 현재 구현된 9개 endpoint의 wire 구조를 반영한 생성 원본. 실제 서버 OpenAPI export는 아직 제공되지 않았음.
- [루트 API 요약](../../API_RESPONSE_SPEC.md): endpoint·필수 응답·예외 코드.
- [화면 데이터 공백](../../API_INTEGRATION_GAPS.md): 미구현 API와 필요한 데이터·운영 보장.

## 연결 원칙

성공 응답은 DTO 자체다. 실패는 안정된 code/category/requestId envelope이며 사용자 입력과 자유 형식 오류를 UI·로그로 전달하지 않는다. 모든 응답은 no-store, 인증은 Bearer token이며 세션 mode는 GUEST/ACTIVE만 사용한다.

가입은 POST /members 한 번으로 처리하고 새 ACTIVE token을 즉시 반영한다. 가입 응답 유실 시 POST를 자동 재전송하지 않고 세션을 재교환한다. 정상 요청의 SESSION_RECOVERY_REQUIRED는 허용된 경우 한 번만 재교환·재시도한다.

답변은 직접 POST /answers, PUT/DELETE /answers/{answerId}로 처리한다. 성공 응답으로 현재 answer/count를 반영한다. timeout·네트워크·파싱 실패·5xx로 미적용을 단정하지 않고, 오늘 조회로 일치하는 내용 확인 또는 사용자의 명시적 재요청을 제공한다. 다른 기기의 다른 답변이 확인되면 작성 중인 글을 지우지 않는다.

Idempotency-Key·command·ticket·receipt·ack·closure·revision·버전·발췌 wrapper는 현재 계약에 없다. dataGeneration 대신 로컬 계정 scope를 쓰며 서버 generation으로 간주하지 않는다.

목록·상세·회원 전체 삭제·분석 API는 서버 미구현이므로 임의 응답을 가정해 호출하지 않는다. 오늘 상세는 이미 제공된 AnswerDetail을 활용하고 그 외 조회 제약은 루트 공백 문서에 기록한다.

## 재현 검증

`node scripts/api-generate.mjs --check`와 계약/단위/브라우저 테스트로 생성물 일치·현재 wire·사용자 흐름을 검증한다. 원문·닉네임·익명 키·token은 URL·로그·분석·검증 artifact에 포함하지 않는다. 테스트는 합성값만 사용한다.
