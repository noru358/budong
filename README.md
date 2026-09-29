# budong

재개발·재건축 지도·검색·개별 물건 투자분석 프로젝트.

## 정본

1. [REDEVELOPMENT_HANDOFF_v0.2_20260928.md](./REDEVELOPMENT_HANDOFF_v0.2_20260928.md)
2. [V1_PROTOTYPE_CONTRACT.md](./V1_PROTOTYPE_CONTRACT.md)

실행 상세:
- [PROJECT_DASHBOARD.md](./PROJECT_DASHBOARD.md) — 현재 상태판 / 사용자·AI 다음 액션
- [docs/WORKSTREAMS_V1.md](./docs/WORKSTREAMS_V1.md)
- [docs/REAL_DATA_PLAN_V1.md](./docs/REAL_DATA_PLAN_V1.md)
- [docs/UPDATE_PIPELINE_V1.md](./docs/UPDATE_PIPELINE_V1.md) — API 없는 변경사항까지 포함한 업데이트 체계

설계가 변경되면 별도 handoff를 계속 늘리기보다 위 정본의 CURRENT/NEXT를 갱신한다.

## 현재 상태 — 2026-09-29

### GATE 0 — 완료
- V1 Prototype Contract 확정
- 공식 법적/행정 용어 canonical
- 쉬운 설명은 보조 레이어
- 자동 투자추천 / 자동 법률판단 금지

### GATE 1 — 완료
- 홈 / 지도 / 검색 / 구역 상세 / 물건 분석·비교 fixture flow 구현
- Search: exact > alias exact > prefix > substring > trigram fuzzy
- Finance: 초기 자기자금 / 향후 추가자금 / 최대 누적 자기자금 / 총 경제적 비용 / 세전손익 / MOIC / XIRR / BEP
- provenance-first DB schema
- GitHub Actions QA

### GATE 2 — 진행 중
- 서울 실제 정비사업 shallow seed **44개** 완료
- deep validation target **10개** 선정
- 정보몽땅 current-stage snapshot과 법적 고시 event를 분리
- 신탁/사업시행자 등 governance event를 stage와 분리
- 한남5·잠실5·상도15·목동10 등 공식 고시 1차 연결
- 불광제5 공식 정보몽땅 stage history 연결
- RTMS + Building HUB adapter 코드 구현
- 실제 서울 seed를 홈/검색/상세 UI에 연결
- 지도 경계 원천 결정: 서울플랜+ SHP를 개인 V1의 `ADMIN_CANDIDATE`로 사용 예정; 파일 미수집 상태라 현재 UI는 FAIL-CLOSED
- 개별 물건 분석은 아직 fixture
- **Update Watcher baseline 구현**
  - 정보몽땅 25개 자치구 사업장 페이지 일 1회 snapshot 감시
  - 서울플랜+ 데이터셋 주 1회 버전 감시
  - source snapshot → diff → change candidate
  - discovery change가 OFFICIAL_CONFIRMED를 직접 덮어쓰지 못함
  - 서울시/25개 자치구 고시·공고 parser는 다음 구현
  - GitHub Actions `Update Watch`: 매일 07:20 KST

## 데이터 안전 규칙

- 포털의 “현재단계 표시”는 `observed_at` snapshot이다.
- 법적 인가/지정 event의 날짜는 공식 고시·공고 근거가 있을 때만 확정한다.
- 고시 정정은 새로운 단계 진입으로 취급하지 않는다.
- 신탁사/사업시행자 지정 등은 `PROJECT_GOVERNANCE_EVENT`로 별도 저장한다.
- unknown은 0이 아니라 `NEEDS_REVIEW`.
- API 키는 Git에 커밋하지 않는다.

## 지금 막힌 외부 의존성

공공데이터포털 활용신청은 사용자 확인 기준 완료됐다. 실제 RTMS / Building HUB 호출을 위해서는 발급된 키를 로컬 `.env` 또는 GitHub Actions Repository Secret의 **`DATA_GO_KR_SERVICE_KEY`** 로만 주입해야 한다.

GitHub 방식에서는 공공데이터포털의 **Decoding 인증키**를 `DATA_GO_KR_SERVICE_KEY`로 저장한 뒤, `Actions → Live Data Smoke → Run workflow`를 실행한다. 이 수동 smoke workflow는 실거래가 + Building HUB를 실제 호출하며 키를 출력하거나 artifact에 저장하지 않는다.

키를 채팅이나 저장소 파일에 붙이지 않는다.

## 다음

### 사용자
1. `DATA_GO_KR_SERVICE_KEY`를 GitHub Repository Secret으로 안전하게 주입
2. `Actions → Live Data Smoke → Run workflow` 1회 실행
3. 결과 성공/실패만 알려주기

### AI / Codex
1. 정보몽땅 source-specific row parser
2. 서울시 고시 parser + 25개 자치구 notice adapter registry
3. 남은 deep target 공식 원문 확정
4. Live Data Smoke 성공 후 RTMS / Building HUB를 최소 5개 deep target에 연결
5. 서울플랜+ SHP 실제 파싱 → 개인 V1 `ADMIN_CANDIDATE` 지도
6. GATE 2 QA → 실제 매물 dogfood(GATE 3)
