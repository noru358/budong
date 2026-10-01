# PROJECT DASHBOARD — budong

기준일: **2026-10-02**  
정본: `REDEVELOPMENT_HANDOFF_v0.2_20260928.md` + `V1_PROTOTYPE_CONTRACT.md`

## 한 줄 상태

**GATE 0·1 완료. GATE 2 실데이터 통합 + 업데이트 자동화 구축 중.**

## Gate Board

| Gate | 목표 | 상태 |
|---|---|---|
| G0 | V1 범위·법적용어·금지사항 Lock | ✅ DONE |
| G1 | Fixture 5화면 + Search + Finance + QA | ✅ DONE |
| G2 | 실제 서울 데이터 + provenance + update pipeline | 🚧 IN PROGRESS |
| G3 | 본인 실제 매물 Dogfood | ⏳ NEXT |
| G4 | 소수 지인 사용성 테스트 | ⏳ LATER |

## 현재 구현

### Product / UX
- 실제 서울 44개 seed를 홈/검색/상세에서 사용
- 공식 단계 snapshot과 법적 event를 구분
- 물건 분석은 아직 fixture
- 지도는 공식/허용 경계 연결 전 FAIL-CLOSED

### Legal / Ontology
- PROJECT_STAGE_EVENT
- PROJECT_GOVERNANCE_EVENT
- RIGHTS_REGULATION_EVENT
- 고시 정정은 별도 correction
- unknown → NEEDS_REVIEW

### Data
- 서울 shallow seed 44개
- deep target 10개
- RTMS adapter
- Building HUB adapter
- Source/License/Assertion/Lineage
- 서울플랜+는 ADMIN_CANDIDATE / RED

### Update Automation
- 정보몽땅 25개 자치구 daily snapshot watcher
- 서울플랜+ weekly version watcher
- Diff → Candidate 구조
- 서울시/25개 구청 고시 parser는 다음 구현
- Candidate가 OFFICIAL fact를 자동 덮어쓰지 못함

### QA
- unit/integration tests
- GitHub Actions CI
- **live-data smoke PASS**
- scheduled update-watch workflow

## GATE 2 Remaining

- [x] DATA_GO_KR_SERVICE_KEY Secret 주입 + Live Data Smoke 성공
- [ ] 최소 5개 deep target RTMS 실제 거래 연결
- [ ] 최소 5개 deep target Building HUB 연결
- [ ] 남은 deep target 공식 고시 원문 확정
- [ ] 정보몽땅 row parser
- [ ] 서울시/25개 구청 notice adapter
- [ ] 서울플랜+ SHP 실제 파일 파싱
- [ ] 개인 V1 지도 ADMIN_CANDIDATE 경계 연결
- [ ] 실제 물건 입력 UI
- [ ] GATE 2 QA

## USER ACTION

**현재 필수 외부 액션 없음.**

공공데이터포털 API Secret 주입과 Live Data Smoke는 완료됐다. 추가 계정/API 신청이 필요한 시점이 생길 때만 사용자 액션을 다시 연다.

## AI / CODEX NEXT

사용자 Secret과 병렬로 진행:
1. Update Watcher baseline
2. 정보몽땅 row parser
3. 서울시 notice parser
4. 자치구 notice adapter registry
5. deep target 원문 보강
6. 서울플랜+ SHP parser
7. real data UI provenance
8. RTMS/Building HUB를 5개 deep target live integration
9. GATE 2 QA
10. GATE 3 actual listing dogfood

## 금지

- 전국 확장
- 비공식 포털 매물 크롤링
- 자동 투자추천
- 자동 법률판단
- 원문 없는 날짜 추정
- 추정 경계를 OFFICIAL로 표시
- RED source를 상용판 정본으로 사용
