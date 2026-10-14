---
paths:
  - "src/data/**/*"
  - "src/domain/**/*"
  - "src/platform/**/*"
  - "tests/**/*"
  - ".claude/spec/05_API_SPEC.md"
---
# 규칙 — API와 결과 확실성

권위는 `.claude/spec/05_API_SPEC.md`, 구현 경계는 06 §3.4다.

- 제품 불변식·채택 계약·구현 가설을 구분한다. 실제 host·서버 존재를 가정하지 않는다.
- wire TypeScript와 Zod validator는 OpenAPI 3.1.1에서 재생성 가능하게 파생한다. 수기 DTO/validator/Mock 정본을 만들지 않는다.
- `ArcaApi`가 validator 통과 결과를 domain model로 바꾼다. native `fetch`를 사용하고 화면에 raw body·server message를 전달하지 않는다.
- 호환 추가 field는 허용하지만 필수 field·타입·날짜·nullability·닫힌 enum/event 오류는 `ProtocolFailure`다.
- `TransportFailure`, `ProtocolFailure`, 인증된 `DomainFailure`, terminal 결과를 섞지 않는다.
- timeout·Abort·5xx·조회 부재는 mutation 미적용 증거가 아니다. 현재 백엔드 가이드에 따라 리소스 확인 또는 명시적 재요청을 제공하며 사용자 임시글을 보존한다.
- 현재 계약은 사용자 제공 백엔드 2.3.0 전환 가이드다. command/ticket/revision/Idempotency-Key를 추가하거나 이전 구조로 자동 재실행하지 않는다.
- 서버 미구현 목록·상세·전체 삭제·분석은 연결을 보류하고 영향과 필요한 데이터를 루트 공백 문서에 기록한다.
- OpenAPI와 계약 예시는 고정 생성·검증 명령으로 우선 소비한다.
