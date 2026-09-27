# V1_PROTOTYPE_CONTRACT

상태: **LOCKED FOR GATE 0**  
기준 정본: `README.md`, `REDEVELOPMENT_HANDOFF_v0.2_20260928.md`  
작성일: 2026-09-28 (Asia/Seoul)

> 이 문서는 V1 Fixture Prototype의 실행 계약이다. 구현 편의를 이유로 아래 범위·법적 용어·계산 의미를 임의 변경하지 않는다.

---

## 1. 목적

V1은 본인 + 소수 지인이 서울 재개발·재건축 구역을 **지도 또는 검색으로 발견**하고, 공식 사업단계와 근거를 확인한 뒤, 개별 물건에 대해 **초기 자기자금 / 향후 추가자금 / 최대 누적 자기자금 / 총비용 / 세전손익 / 미확인사항**을 비교할 수 있는 검증 프로토타입이다.

V1의 성공 기준은 “데이터를 많이 모았다”가 아니라 다음 한 바퀴가 fixture만으로 끊김 없이 동작하는 것이다.

```text
홈/검색 또는 지도
→ 구역 선택
→ 공식 사업단계·근거 확인
→ 물건 선택/입력
→ 자금·손익 계산
→ 다른 물건과 비교
```

---

## 2. 핵심 동선

### A. 목적형 탐색
`홈 검색 → 검색결과 → 구역상세 → 물건분석 → 비교`

- 구역명/단지명/주소/지번/역/별칭 일부만 입력해도 후보를 반환한다.
- 검색결과에 `사업유형 + 공식 현재 사업단계`를 항상 표시한다.

### B. 탐색형
`지도 → 구역 요약카드 → 구역상세 → 물건분석 → 비교`

- 경계의 성격을 `OFFICIAL / ADMIN_CANDIDATE / ANALYSIS_ESTIMATE`로 구분한다.
- 추정 경계를 공식 경계처럼 표시하지 않는다.

### C. 재방문
`홈 → 최근 본 곳 / 분석 중 물건 → 이어보기`

V1에서는 로그인 없이 로컬 상태로도 허용한다.

---

## 3. V1 화면 — 정확히 5개

1. **홈**
   - 통합 검색
   - 최근 본 구역
   - 분석 중 물건
   - fixture 기준 최근 변경

2. **지도**
   - 구역 경계
   - 구역명
   - 사업유형
   - 공식 현재 사업단계
   - 경계 신뢰/성격

3. **검색**
   - canonical name / alias / 주소 / 역
   - exact > alias exact > prefix > substring > fuzzy
   - 결과에 사업유형·공식 단계 상시 노출

4. **구역 상세**
   - 공식 구역명, 사업유형
   - 공식 현재 사업단계 + 효력/기준 날짜
   - 최근 확인일
   - 쉬운 설명은 공식 명칭 아래 보조 레이어
   - 단계 이력 / 권리·규제 / 원문·출처 / 사용자가 추가한 물건

5. **물건 분석 + 비교**
   - 첫 화면 최대 6개: 초기 자기자금, 향후 추가자금, 최대 누적 자기자금, 총비용, 기준 시나리오 세전손익, 최대 미확인사항
   - 상세: 가격구성, 날짜별 cash flow, 분담금, 금융, MOIC, 유효한 경우 XIRR, 손익분기 매도가, 민감도

---

## 4. Tier 1 데이터

GATE 1에서 반드시 존재해야 하는 최소 필드다. 실데이터 승인을 기다리지 않고 fixture/manual seed를 허용한다.

### PROJECT
- id
- canonical_name
- aliases[]
- project_type_code / project_type_name_official
- jurisdiction
- centroid
- current_stage_code
- current_stage_name_official
- current_stage_effective_date
- verified_at
- source_assertion_id

### PROJECT_STAGE_EVENT
- project_id
- stage_code
- stage_name_official
- legal_framework
- event_date
- source_assertion_id
- certainty

### RIGHTS_REGULATION_EVENT
- project_id
- event_type_code
- event_name_official
- effective_date
- status
- source_assertion_id
- note

### BOUNDARY_VERSION
- project_id
- geometry
- boundary_kind
- valid_from / valid_to
- source_assertion_id

### INVESTMENT_CASE
- id / project_id / label
- contract_price
- acquisition_incidental_cost
- existing_deposit_assumed
- loan_draws
- paid_contribution
- remaining_contribution
- scheduled_cashflows
- exit_date / exit_price
- user_assumptions
- unresolved_items

### SOURCE / SOURCE_LICENSE / FACT_ASSERTION / SOURCE_LINEAGE
모든 핵심 사실은 출처, 기준일, 확인상태, 라이선스 상태를 추적한다.

---

## 5. 계산 규칙

### 서로 다른 네 개를 절대 합치지 않는다
1. **초기 자기자금**: 취득 시점까지 사용자가 실제로 투입해야 하는 자기 현금
2. **전체 매입·사업비용**: 경제적 원가의 총합
3. **최대 누적 자기자금**: 시계열상 자기자금 누적 투입의 최대치
4. **날짜별 현금흐름**: XIRR/자금부족시점 계산의 원장

### V1 기준 산출
- initial_equity_required
- future_additional_equity
- peak_cumulative_equity
- total_economic_cost
- pretax_profit
- MOIC
- XIRR: 실제 날짜가 충분할 때만
- break_even_exit_price
- funding_gap_date
- sensitivity: 분담금 / 금리 / 기간 / exit price

### 금지
- 보증금/대출을 경제적 비용 감소로 처리하지 않는다.
- 프리미엄을 이중산입하지 않는다.
- 기납부 분담금을 매매가와 미래 분담금에 중복산입하지 않는다.
- unknown을 0으로 저장하지 않는다.
- 날짜가 없는데 IRR/XIRR을 확정 표시하지 않는다.
- 하나의 IRR 숫자로 “좋은 투자/나쁜 투자”를 판정하지 않는다.

---

## 6. 공식 용어 / 권리 규칙

- 공식 법정·행정 명칭이 정본이다.
- `정비구역지정`, `조합설립인가`, `사업시행계획인가`, `관리처분계획인가` 등은 쉬운 말로 치환하지 않는다.
- 신속통합기획 등 정책·행정 절차와 도시정비법상 법정 인가/고시 사건을 별도 축으로 보존한다.
- 권리산정기준일, 조합원 지위, 분양자격, 거래규제 등은 사업단계와 별도 Event로 저장한다.
- 자료가 부족하면 법률 결론 대신 `확인 필요`를 반환한다.
- 쉬운 설명은 `official_name`을 덮어쓰지 않는 별도 `plain_explanation` 필드다.
- 중요 법률/권리 사실에 AI 자동확정 금지.

확인상태 enum:
`OFFICIAL_CONFIRMED / SOURCE_CONFIRMED / ESTIMATED / USER_ASSUMPTION / NEEDS_REVIEW`

---

## 7. Search 요구사항

입력 대상:
- canonical project name
- alias / 옛 명칭 / 후보지 명칭
- 단지명
- 주소/지번
- 지하철역

정규화:
- Unicode NFC
- 공백/중점/괄호 표준화
- 한글·숫자 토큰 보존
- 원문을 삭제하지 않고 별도 normalized 컬럼 사용

랭킹 baseline:
1. canonical exact
2. alias exact
3. canonical/alias prefix
4. substring
5. trigram fuzzy

모든 검색결과는 최소한:
`canonical_name | project_type_name_official | current_stage_name_official | jurisdiction`
를 반환한다.

---

## 8. 완료조건 / 금지사항

### GATE 1 완료조건
- 5개 화면이 fixture로 연결된다.
- 최소 10개 project fixture, 20개 investment-case fixture가 존재한다.
- 검색이 exact/prefix/substring/fuzzy의 대표 케이스를 통과한다.
- 검색결과·지도카드·상세 상단에서 공식 사업단계가 보인다.
- 계산 엔진이 정상/중복산입/unknown/XIRR edge case 테스트를 통과한다.
- 핵심 fact가 source + reviewed_at + license label과 연결된다.
- 쉬운 설명이 공식 명칭을 대체하지 않는다.

### V1 금지
- 전국 확장
- 비공식 포털 매물 크롤링
- 자동 법률판단
- 자동 투자추천/점수화
- AI 감정가
- 커뮤니티/결제/경매/중개사 계약/소유주 인증
- 실제 API 승인 대기 때문에 GATE 1을 중단하는 것

---

## 변경 규칙

이 계약을 바꿀 때는:
1. 변경 이유를 정본 CURRENT/NEXT에 기록하고,
2. 관련 스키마/fixture/test를 같은 변경에서 갱신하며,
3. 공식 용어·권리 원칙을 약화시키는 변경은 하지 않는다.
