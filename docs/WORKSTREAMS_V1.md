# V1 WORKSTREAMS — 2026-09-28

> 2026-10-02: 5개 부서가 병렬 구현·통합했다. 수동입력·저장·비교·계산·검색을 검증하고 5구역6고시의 정보·본문을 재검토했다. 실제 목록 parser로 서울25구/1,184개 사업장 baseline을 수집했다. 전체117개 테스트·브라우저 동선 PASS. 각 부서 현황과 다음 배정은 PROJECT_DASHBOARD.md, 검증 범위는 docs/VALIDATION_V1.md를 따른다. API·지도·공식 사실 자동반영을 포함한 G2 실제 연결은 진행 중이다.

기준: README.md, REDEVELOPMENT_HANDOFF_v0.2_20260928.md, V1_PROTOTYPE_CONTRACT.md

## A. Legal / Ontology

### 원칙
- 공식 법정·행정 명칭이 canonical이다. 쉬운 설명은 별도 plain_explanation이다.
- 정책/행정 프로그램과 법정 사업단계를 한 축으로 합치지 않는다.
- 신속통합기획은 POLICY_PROGRAM_EVENT로 취급하며 조합설립인가·사업시행계획인가 같은 법정 stage를 대체하지 않는다.
- 권리산정기준일, 조합원 지위, 분양자격, 거래규제는 RIGHTS_REGULATION_EVENT로 stage와 분리한다.
- 자료가 부족하면 NEEDS_REVIEW. AI가 PASS/FAIL 법률결론을 자동 확정하지 않는다.
- **포털의 '현재단계 표시'와 법적 event는 동일 객체가 아니다.** 현재단계 표시는 `observed_at`이 있는 snapshot으로 저장하고, 법정 인가·지정은 고시/공고 근거가 있는 `PROJECT_STAGE_EVENT`로 저장한다.
- 신탁방식처럼 조합과 다른 사업시행자가 존재할 수 있으므로 `사업시행자 지정/신탁사 표시/시행방식`은 `PROJECT_GOVERNANCE_EVENT`로 분리한다.
- 고시 정정은 새로운 사업단계로 올리지 않고 원 event에 연결하는 correction event다.

### V1 핵심 stage dictionary
1. 정비구역 지정·고시
2. 조합설립추진위원회 승인
3. 조합설립인가
4. 사업시행계획인가
5. 관리처분계획인가
6. 착공
7. 준공인가
8. 이전고시

사업유형은 V1 핵심 흐름에서 재개발사업 / 재건축사업을 우선 구현한다. 서울시의 세부 분류는 별도 official classification 필드로 보존한다.

### 권리·규제 event 최소 사전
- RIGHTS_CALCULATION_BASE_DATE / 권리산정기준일
- MEMBERSHIP_ELIGIBILITY / 조합원 지위·분양자격
- TRANSACTION_RESTRICTION / 거래규제
- OCCUPANCY_OR_RESIDENCE_REQUIREMENT / 거주·입주 관련 요건
- CASH_SETTLEMENT_OR_EXCLUSION / 현금청산·분양대상 제외 관련 사실

각 event는 effective_date, status, source_assertion_id, note를 가진다.

## B. Data

### 데이터 계보
source → source_license → fact_assertion → entity/event → source_lineage

파생값은 upstream 중 가장 제한적인 license readiness를 상속한다.

### Gate 1
- 실제 구역처럼 보이지만 명시적으로 fixture인 project 10개
- investment fixture 20개
- 경계는 ANALYSIS_ESTIMATE로 표시
- 공식 데이터인 척 하지 않는다.

### Gate 2 현재 진행
- 서울 실제 shallow seed 44개 작성 완료: `data/seoul_seed_v1.json`
- deep validation 10개 선정: `data/deep_validation_v1.json`
- 2026-09-28 현재 고시 원문/공식 인덱스 연결을 진행 중이며, 원문 없는 날짜는 채우지 않는다.

### Gate 2 목표
- 서울 30~50개 구역: 이름/경계/사업유형/공식 현재단계/단계일
- 그중 5~10개: 단계 이력/고시·공고/실거래/건물·필지/권리·규제까지 상세
- 모든 adapter는 fetch → normalize → assertion → upsert → lineage → validate 순서
- 원문 locator, effective_at, reviewed_at를 누락하지 않는다.

## C. Finance

### 네 개의 독립 개념
1. initial_equity_required: 취득 시점까지 실제 자기현금
2. total_economic_cost: 매입·부대비·향후 사업비·금융비·매도비 등 경제적 원가
3. peak_cumulative_equity: 시간축에서 자기자금 투입 누적 최대
4. dated cashflows: XIRR와 자금부족시점의 원장

### 중복산입 방지
- seller가 이미 납부한 분담금은 contract_price에 반영된 것으로 보고 paid_contribution을 다시 경제적 비용에 더하지 않는다.
- 기존 보증금과 대출원금은 financing/liability이며 경제적 원가를 줄이지 않는다.
- future event의 loan_funded는 필요한 자기자금만 줄인다.
- unknown은 0이 아니라 NEEDS_REVIEW.

### 산출
initial equity / future additional equity / peak equity / total economic cost / pretax profit / MOIC / dated XIRR / break-even exit price / funding gap date.

## D. Search

### 정규화
- Unicode NFC
- 공백·중점·괄호 표준화
- 한글/숫자 보존
- 원문과 normalized 필드 분리

### 랭킹
1. canonical exact
2. alias exact
3. prefix
4. substring
5. trigram fuzzy

주소/지번/역 명칭도 후보 term으로 다룬다. PostgreSQL에서는 pg_trgm GIN index를 baseline으로 둔다.

모든 결과는 canonical_name / project_type_name_official / current_stage_name_official / jurisdiction을 노출한다.

## E. UX

V1 화면은 정확히 다섯 개다.

### 홈
검색, 최근 본 구역, 분석 중 물건, 최근 변경.

### 지도
구역명 + 공식 사업유형 + 공식 현재단계. 경계 kind를 OFFICIAL / ADMIN_CANDIDATE / ANALYSIS_ESTIMATE로 구분.

### 검색
부분일치·alias·오타를 허용하고 결과 카드에 공식 단계 상시 노출.

### 구역 상세
상단에 공식 명칭/단계/날짜/최근 확인일. 그 아래에 쉬운 설명. 권리·규제와 원문을 별도 블록으로 둔다.

### 물건 분석·비교
첫 화면 숫자는 최대 6개:
- 지금 필요한 내 돈
- 앞으로 추가로 필요한 돈
- 최대 누적 자기자금
- 총 경제적 비용
- 기준 시나리오 세전손익
- 가장 중요한 미확인사항

그 아래 MOIC, 유효한 XIRR, 손익분기 매도가, 현금흐름, 민감도를 보여준다.

## QA / Gate 1

현재 자동테스트가 검증해야 하는 것:
- fixture project 10 / case 20
- exact / alias / prefix / substring / 주소·역 / fuzzy
- paid contribution 이중산입 방지
- 보증금·대출과 경제적 비용 분리
- unknown fail-closed
- XIRR 날짜/부호 edge case

Gate 1에서 실제 API 승인을 기다리지 않는다. 실데이터 연결은 Gate 2다.
