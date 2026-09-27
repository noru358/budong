# 재개발 지도·투자분석 프로젝트 — 세션 인계 정본 v0.2
작성일: 2026-09-28 (Asia/Seoul)

> 목적: 다음 ChatGPT / Claude / Codex 세션이 별도 재해석 없이 바로 이어서 작업하도록 하는 실행용 인계문서.
> 우선순위: 이 문서의 `확정사항 / 금지사항 / CURRENT / NEXT`가 이전 대화 요약보다 우선한다.

---

## 0. 프로젝트 한 줄 정의

**서울 재개발·재건축 사업구역을 지도와 검색으로 쉽게 찾고, 공식 사업단계·법적/권리 정보를 정확히 유지하면서, 사용자가 발견한 개별 물건의 초기자금·최대 누적 자기자금·총비용·프리미엄·분담금·주변가치·예상 손익·엑싯 시나리오를 쉽게 비교하는 투자분석 도구.**

장기적으로는 상용 서비스 가능성을 열어두지만, 현재 V1은 **본인 + 소수 지인용 검증 프로토타입**이다.

---

## 1. 지금까지 진행된 단계

```text
[완료] 시장조사 — 재개발닷컴
   ↓
[완료] 경쟁제품 역분해
   ↓
[완료] 초기 탐색 — 데이터/기술/차별화
   ↓
[완료] 제품·DB·계산 구조 초안
   ↓
[완료] 외부 감사(Claude) + 스코프 축소
   ↓
[완료] 법적 용어 / 검색 / 홈 / 라이선스 원칙 보정
   ↓
[NEXT] V1 실행 계약 확정 + 5개 워크스트림 병렬 착수
   ↓
[NEXT] Fixture Prototype
   ↓
[NEXT] 실제 데이터 Adapter 연결
   ↓
[NEXT] 본인 Dogfood
   ↓
[NEXT] 소수 지인 사용성 검증
```

---

# 2. 절대 바꾸면 안 되는 제품 원칙

## 2.1 법적·공식 용어가 항상 정본

재개발/재건축은 법적 용어와 권리관계가 제품 신뢰의 핵심이다.

- `조합설립인가`, `사업시행계획인가`, `관리처분계획인가`, `정비구역지정` 등 **공식 사업단계 명칭을 임의로 쉬운 말로 대체하지 않는다.**
- 재개발닷컴이나 공식 행정자료에 존재하는 사업유형·단계·권리 용어도 임의 번역/축약하지 않는다.
- 초보자용 표현은 **보조 라벨 / 설명문 / 툴팁 / 별도 안내 레이어**로만 제공한다.
- 사업유형마다 절차가 다르므로 하나의 임의 5단계 사다리로 덮지 않는다.
- 신속통합기획 등 정책·행정상 단계와 도시정비법상 법정 인가 단계는 성격을 구분해 저장한다.
- `권리산정기준일`, 거래규제, 조합원 지위/분양자격 관련 사실 등은 사업 진행단계와 별도 축으로 관리한다.
- 필요한 사실이 부족할 때 `입주권 PASS`, `분양자격 확정` 같은 자동 법률결론을 내리지 않는다. 기본 상태는 `확인 필요`.

### UI 예시

```text
조합설립인가
2026.04.17

쉽게 보기
토지등소유자 동의를 거쳐 조합 설립을 관할 행정청이 인가한 단계입니다.

[법적 의미] [근거 원문] [다음 절차]
```

공식 명칭이 위, 쉬운 설명이 아래다.

---

## 2.2 접근성은 정보를 삭제하는 것이 아니라 '읽는 순서'를 바꾸는 것

최상위 모토:

> **누구나 대충 쓱쓱 볼 수 있을 만큼 쉽고, 필요한 사용자는 재개발닷컴 수준 이상으로 깊게 내려갈 수 있어야 한다.**

### 한 데이터, 세 깊이

1. **쓱 보기** — 구역명, 공식 사업단계, 핵심 날짜, 처음 필요한 돈, 최대 필요자금, 가장 큰 미확인사항
2. **비교·이해** — 가격 구성, 자금 시간표, 주변 거래, 시나리오, 사업 이력
3. **전문·원문** — 정확한 법적 용어, 고시/공고 원문, 필지/건물, 산식, 근거·기준일·출처

---

## 2.3 지도와 검색은 동급의 핵심 진입점

사용자의 의도는 둘로 나뉜다.

```text
탐색형: "어디에 재개발이 있지?" → 지도
목적형: "상도15 / 하안주공10단지 / 이 주소를 보고 싶다" → 검색
```

따라서 홈 / 지도 / 검색은 모두 핵심이다.

---

## 2.4 개별 물건 분석이 제품의 본체

핵심 질문:

- 무엇을 사는가?
- 지금 얼마가 필요한가?
- 나중에 얼마가 더 필요한가?
- 진행 중 자기자금이 최대 얼마까지 묶이는가?
- 총비용은 얼마인가?
- 프리미엄/분담금은 어떻게 구성되는가?
- 주변 신축/실거래와 비교하면 어떤가?
- 어떤 가정에서 얼마가 남는가?
- 엑싯 시기와 조건은 무엇인가?
- 아직 확인되지 않은 법적·권리·금융 사실은 무엇인가?

`초투` 한 숫자만 크게 보여주는 서비스를 만들지 않는다.

---

# 3. 경쟁제품(재개발닷컴)에서 반드시 baseline으로 가져갈 UX

## 3.1 검색

검색 대상:
- 구역명
- 단지명
- 주소/지번
- 지하철역
- 별칭/옛 명칭/후보지 명칭

요구사항:
- 전체 이름을 정확히 입력하지 않아도 결과가 나와야 한다.
- Prefix / 부분일치 / Alias / 오타·유사 문자열 검색을 지원한다.
- 검색결과 목록 자체에 **사업유형 + 공식 현재 사업단계**를 표시한다.

예:

```text
하안주공

하안주공1·2단지
재건축 · 추진위승인
광명시 하안동

하안주공8단지
재건축 · 정비구역지정(공람)
광명시 하안동
```

V1 검색 후보:
- PostgreSQL `pg_trgm`
- 한글 normalization
- Alias table
- Exact > alias exact > prefix > substring > fuzzy 순으로 랭킹

## 3.2 사업단계 상시 노출

사업단계는 상세페이지 안쪽 정보가 아니라 **구역명과 붙어 다니는 핵심 정보**로 취급한다.

검색결과, 지도 카드, 구역 상단, 최근 본 곳, 관심 구역 등에 현재 공식 사업단계를 함께 노출한다.

## 3.3 상세 탭 구조

정보과밀을 막기 위해 재개발닷컴처럼 탭/카드/펼치기를 적극 사용한다.

후보:
- 개요
- 진행현황
- 실거래
- 물건
- 권리·규제
- 자료/원문
- 주변 비교
- 생활/입지

실제 V1에서는 데이터가 있는 탭만 노출한다.

## 3.4 사용자 수정/추가 제보

상용/확장 단계에서 `정보 수정 요청 / 자료 추가 요청` 진입점을 고려한다.
변동이 잦은 데이터 서비스에서 사용자 제보를 QA 센서로 활용한다.

---

# 4. 메인 IA / 홈 방향

현재 제안 Primary Navigation:

**홈 / 지도 / 검색 / 비교 / 내 정보**

V1에는 커뮤니티를 만들지 않는다. 커뮤니티가 실제로 생기기 전 Primary Navigation에 빈 탭을 만들지 않는다.

## 홈의 역할

홈은 "지도 축소판"이 아니다.

- 이미 아는 구역/단지/주소를 바로 검색
- 최근 본 구역
- 분석 중인 내 물건
- 관심 구역
- 오늘 바뀐 구역/사업단계
- 필요 시 초보자용 진입

예시:

```text
┌──────────────────────────────┐
│ 구역·단지·주소·역 검색       │
└──────────────────────────────┘

최근 본 곳
상도15 | 하안주공8 | 청파2

내가 분석 중인 물건
상도15 / OO빌라
처음 3.8억 · 최대 7.6억

최근 변경
조합설립인가   OO구역
정비구역지정   XX구역

[홈] [지도] [검색] [비교] [내 정보]
```

---

# 5. V1 핵심 화면 — 5개

## 1) 홈
검색 중심. 최근 본 곳/내 물건/최근 변경.

## 2) 지도
- 공식/확인된 구역 경계
- 구역명
- 사업유형
- 공식 현재 사업단계
- 클릭 시 요약 카드

경계 정확도/성격:
- 공식 확인 경계
- 후보지/행정 범위
- 분석용 추정 범위
를 구분한다.

## 3) 검색
- 구역/단지/주소/역
- 부분일치/유사검색
- 결과에 사업유형·공식 현재단계 노출

## 4) 구역 상세
상단:
- 구역명
- 사업유형
- 공식 사업단계 + 날짜
- 최근 확인일
- 법적/권리 핵심 표시

하단:
- 사업 이력
- 실거래
- 주변 신축
- 권리·규제
- 자료/원문
- 사용자가 추가한 물건

## 5) 물건 분석 + 비교
첫 화면의 핵심 숫자는 최대 5~6개로 제한:

- 지금 필요한 내 돈
- 앞으로 추가로 필요한 돈
- 최대 누적 자기자금
- 전체 매입·사업비용
- 기준 시나리오 세전 손익
- 가장 중요한 미확인사항

더 내려가면:
- 프리미엄
- 기납부/잔여 분담금
- 대지지분
- 공시가격
- 주변 실거래
- 주변 신축
- Cash Flow
- XIRR / MOIC
- 손익분기 Exit Price
- 분담금/금리/기간/매도가 민감도

---

# 6. 투자 계산 엔진 — 유지할 핵심 규칙

반드시 구분:
1. 초기 자기자금
2. 전체 매입·사업비용
3. 최대 누적 자기자금 투입액
4. 날짜별 현금흐름

### 금지
- 보증금/대출을 경제적 비용에서 빼서 수익처럼 만들지 않는다.
- 프리미엄을 매매가에 포함하고 다시 비용에 더하지 않는다.
- 기납부 분담금을 매매가와 미래 분담금 양쪽에 중복산입하지 않는다.
- 모르는 값을 0으로 저장하지 않는다.
- 실제 날짜가 없는데 XIRR인 것처럼 표시하지 않는다.
- IRR 하나로 투자 매력을 판단하지 않는다.

### 핵심 결과
- 세전 손익
- 최대 자기자금
- MOIC
- XIRR(유효할 때)
- 손익분기 매도가
- 보유기간
- 자금 부족 시점
- 시나리오 민감도

---

# 7. 데이터 구조 — 공식 사실과 설명/추정을 분리

주요 Entity:

```text
PROJECT
STAGE_FRAMEWORK
PROJECT_STAGE_EVENT
RIGHTS_REGULATION_EVENT

BOUNDARY_VERSION
PARCEL
BUILDING
UNIT

TRANSACTION
LISTING_OBSERVATION
INVESTMENT_CASE
CASHFLOW_SCENARIO

SOURCE
SOURCE_LICENSE
FACT_ASSERTION
SOURCE_LINEAGE
```

## 핵심 원칙
- 공식 사업단계 원문/코드/출처기관/효력일을 보존.
- 경계 변경 시 과거 버전을 삭제하지 않는다.
- 공개 데이터가 호실을 확정하지 못하면 호실을 추정하지 않는다.
- `공식 확인 / 자료 확인 / 추정 / 사용자 가정 / 확인 필요` 상태를 필드별로 구분한다.
- AI는 중요 법률/권리 사실을 자동 확정하지 않는다.

---

# 8. 데이터 라이선스 / 상용화 준비 라벨

지금은 비공개 V1이어도 **라벨은 처음부터 저장한다.**

`SOURCE_LICENSE` 최소 필드:

```text
source_id
license_name
commercial_use
redistribution
derivative_use
attribution_required
ai_processing
reviewed_at
review_note
```

상태:
- GREEN = 상업적 사용 확인
- YELLOW = 조건/출처표시/계약 등 추가 확인 필요
- RED = 현재 상업판 기본 차단
- WHITE = 미검토

## Source Lineage
여러 데이터가 합쳐진 파생지표는 upstream source를 모두 추적한다.

```text
파생지표
 ├─ source A [GREEN]
 ├─ source B [GREEN]
 └─ source C [RED]

commercial_readiness = RED
```

기본 규칙은 **가장 제한적인 원천의 상태를 상속**한다.
향후 상용화 Gate에서 RED/YELLOW를 일괄 감사한다.

---

# 9. 데이터 범위 — 넓고 얕게 + 좁고 깊게

## 지도용
서울 **30~50개 구역**
- 이름
- 경계
- 사업유형
- 공식 현재 사업단계
- 단계 날짜

## 상세 검증용
그중 **5~10개 구역**
- 사업 이력
- 고시/공고
- 실거래
- 건물/필지
- 주변 아파트
- 권리/규제

## 투자분석용
**20~30개 실제/fixture 물건**
- 계산 입력
- 현금흐름
- 시나리오
- 비교

---

# 10. V1에서 하지 않는 것

현재 V1 범위 밖:
- 전국 서비스
- 전국 매물망
- 비공식 네이버 매물 크롤링
- 결제
- 중개사 계약 시스템
- 경매
- 소유주 인증
- 커뮤니티
- 앱
- 푸시 알림
- 자동 투자 추천
- 복잡한 AI 감정가
- 자동 법률판단
- 완전 자동 고시 수집 파이프라인

---

# 11. 회사식 병렬 워크스트림

```mermaid
flowchart TD

    A["0. 제품 방향 / V1 계약"] --> G0{"GATE 0: 범위 확정"}

    G0 --> L
    G0 --> D
    G0 --> F
    G0 --> S
    G0 --> U

    subgraph LEGAL["A. Legal / Ontology"]
      L["공식 사업유형·단계 체계"] --> L2["권리·규제 Event 체계"]
      L2 --> L3["공식 용어 Dictionary"]
      L3 --> L4["License / Source 정책"]
    end

    subgraph DATA["B. Data"]
      D["API 신청·원천 확인"] --> D2["30~50 구역 Seed DB"]
      D2 --> D3["5~10 구역 상세"]
      D3 --> D4["Source Adapter"]
      D4 --> D5["Provenance / Lineage"]
    end

    subgraph FIN["C. Finance"]
      F["Fixture 사례"] --> F2["초기자금"]
      F2 --> F3["최대 누적 자기자금"]
      F3 --> F4["분담금·금융·Exit"]
      F4 --> F5["XIRR / MOIC / BEP / Scenario"]
    end

    subgraph SEARCH["D. Search"]
      S["Entity / Alias 설계"] --> S2["부분일치·유사검색"]
      S2 --> S3["결과 랭킹"]
      S3 --> S4["결과 + 공식 사업단계"]
    end

    subgraph UX["E. UX / Frontend"]
      U["IA"] --> U2["홈"]
      U2 --> U3["지도"]
      U3 --> U4["검색"]
      U4 --> U5["구역 상세"]
      U5 --> U6["물건 분석 / 비교"]
    end

    L4 --> G1
    D5 --> G1
    F5 --> G1
    S4 --> G1
    U6 --> G1

    G1{"GATE 1: Fixture Prototype"} --> INT["실데이터 Adapter 연결"]
    INT --> QA["QA: 법적용어 / 데이터 / 계산 / 검색"]
    QA --> G2{"GATE 2: 본인이 실제로 쓸 만한가?"}
    G2 -->|NO| U
    G2 -->|NO| F
    G2 -->|YES| DOG["실제 매물 Dogfood"]
    DOG --> G3{"GATE 3: 반복 사용 가치?"}
    G3 -->|NO| A
    G3 -->|YES| TEST["소수 지인 테스트"]
    TEST --> G4{"GATE 4: 초보자도 이해하는가?"}
    G4 -->|NO| U
    G4 -->|YES| EXP["확장 검토"]
```

---

# 12. 역할 분해

| 워크스트림 | 할 일 | 최초 산출물 |
|---|---|---|
| Product/PM | 범위, 우선순위, Gate | V1 Contract |
| Legal/Ontology | 공식 사업단계, 권리/규제, 용어 | Stage & Rights Dictionary |
| Data | API, 경계, 거래, 건물, 출처 | Seed DB |
| Search | 명칭/별칭/주소/유사검색 | Search Index |
| Finance | 현금흐름, 초투, 최대자금, Exit | Calculation Engine |
| UX/UI | 홈/지도/검색/상세/비교 | Fixture Prototype |
| QA | 법적용어·정합성·계산 검증 | Validation Suite |
| Research | 본인/지인 사용성 | Test Report |

---

# 13. Gate 정의

## GATE 0 — V1 계약
- 법적 용어 원칙 확정
- V1 화면/데이터 범위 확정
- 하지 않을 것 확정

## GATE 1 — Fixture Prototype
- 홈/지도/검색/구역/분석·비교가 fixture로 한 바퀴 동작
- 계산 엔진 테스트 통과
- 검색에 사업단계 상시 노출
- 초보 설명이 공식 용어를 덮지 않음

## GATE 2 — 실제 데이터 통합
- 최소 5개 구역 실제 데이터
- 출처/기준일/라이선스 라벨 확인
- 실거래/단계/경계 연결 검증

## GATE 3 — 본인 Dogfood
- 실제 매물 검토 시 기존 엑셀/여러 사이트보다 편한가?
- 자금 시간표가 실질적으로 도움이 되는가?
- 3초 카드가 실제로 읽히는가?

## GATE 4 — 지인 테스트
- 초보자가 공식 단계명을 보고도 의미를 이해하는가?
- 처음 필요한 돈 / 최대 필요자금 / 미확인사항을 설명할 수 있는가?

---

# 14. CURRENT

현재 상태(2026-09-28):

## 완료

- **GATE 0 완료** — `V1_PROTOTYPE_CONTRACT.md` LOCK.
- **GATE 1 완료** — fixture 기준 5화면 end-to-end + Search + Finance + QA.
- 사용자가 공공데이터포털 개발계정 활용신청 완료 확인:
  - 연립다세대 매매
  - 단독/다가구 매매
  - 아파트 전월세
  - 아파트 매매 상세
  - 아파트 분양권전매
  - 아파트 매매
  - Building HUB 건축물대장정보
- **GATE 2 실제 데이터 통합 진행 중.**
  - `data/seoul_seed_v1.json`: 서울 실제 정비사업 44개 shallow seed
  - `data/deep_validation_v1.json`: 10개 deep target
  - `docs/REAL_DATA_PLAN_V1.md`: real-data source hierarchy / adapter / Gate2 exit
  - `src/adapters/contracts.mjs`: provenance / license / secret fail-closed 계약
  - `src/adapters/data_go_kr.mjs`: RTMS + Building HUB request/normalize adapter
  - `.env.example` + `.gitignore`: API key 비커밋 구조
- Deep validation에서 실제 데이터 모델을 보정함:
  - 정보몽땅 `현재단계 표시`는 법적 event가 아니라 source snapshot
  - 법정 단계는 공식 고시·공고 기반 `PROJECT_STAGE_EVENT`
  - 신탁/사업시행자 등은 `PROJECT_GOVERNANCE_EVENT`
  - 고시 정정은 새 단계가 아니라 correction event
- 1차 공식 근거 연결:
  - 상도15: 정비구역 지정 고시 제2025-178호 / 2025-04-03
  - 한남5: 사업시행인가 용산구 고시 제2026-55호 / 2026-04-30
  - 잠실5: 사업시행계획인가 송파구 고시 제2026-90호 / 2026-07-09
  - 잠실5 정정: 송파구 고시 제2026-99호 / 2026-08-20
  - 목동10: 정비구역 지정 서울시 고시 제2025-420호 / 2025-07-31
  - 독바위역세권: 정비구역 지정 제2019-237호 원문 연결, 사업시행인가 제2026-37호는 공식 서울시 인덱스까지 확인(직접 원문/고시일 추가 확인 필요)
  - 불광제5: 정보몽땅 stage history에서 사업시행인가 2021-09-23 / 관리처분인가 2024-11-28 확인, 원 구청 고시 연결 전 SOURCE_CONFIRMED 유지
- `web/index.html`:
  - 홈/검색/구역 상세은 실제 44개 seed 사용
  - deep target에는 공식 고시 evidence 표시
  - 지도는 공식 경계 전 FAIL-CLOSED
  - 물건 분석만 아직 fixture

## 아직 완료되지 않음

- 실제 API key를 이용한 live RTMS / Building HUB call
- deep target 최소 5개에 실거래 + 건축물대장까지 실제 연결
- 청파2 / 공덕6 / 흑석9 / 망원 등 남은 원문 deep validation
- 공식 정비구역 polygon source 확정
- 실제 매물 입력 / dogfood
- 지인 usability test

---

# 15. NEXT

## A. 사용자만 해야 하는 외부 액션 — 현재 1개

발급된 공공데이터포털 키를 **채팅에 보내지 말고**, 아래 둘 중 하나로 주입한다.

### 권장: GitHub Actions Repository Secret

`noru358/budong → Settings → Secrets and variables → Actions → New repository secret`

- Name: `DATA_GO_KR_SERVICE_KEY`
- Secret: 공공데이터포털에서 발급된 서비스키

키를 README, issue, commit, source code에 넣지 않는다.

### 로컬 개발만 할 경우

저장소 루트에서 `.env.example`을 `.env`로 복사하고:

```text
DATA_GO_KR_SERVICE_KEY=발급된키
```

로컬 `.env`는 `.gitignore` 처리되어 있다.

**둘 중 하나면 충분하다.**

VWorld 등 추가 키는 아직 신청하지 않는다. 공식 경계 source 비교가 끝난 뒤 필요할 때만 요청한다.

## B. 다음 구현

키 주입 전에도:
1. 나머지 deep target 공식 고시/공고 원문 확정
2. boundary 후보의 정확도/라이선스 비교
3. 실데이터 UI와 provenance 강화

키 주입 후 즉시:
4. RTMS live smoke
5. Building HUB live smoke
6. 5개 deep target에 거래/건축물 실제 연결
7. source lineage + QA
8. 공식 boundary adapter
9. GATE 2 종료판정
10. 실제 매물 dogfood → GATE 3

---

# 16. 다음 세션 첫 지시문

> `README.md`, `REDEVELOPMENT_HANDOFF_v0.2_20260928.md`, `V1_PROTOTYPE_CONTRACT.md`를 정본으로 읽어. GATE 0과 GATE 1은 완료했고 GATE 2 실제 데이터 통합 중이다. `data/seoul_seed_v1.json`, `data/deep_validation_v1.json`, `src/adapters/contracts.mjs`, `src/adapters/data_go_kr.mjs`, `db/schema.sql`, `web/index.html`을 실제로 읽고 이어가. 포털 current-stage snapshot과 법적 stage event를 혼동하지 말고, 신탁/사업시행자 governance event도 별도 축으로 유지한다. 원문이 없는 날짜·권리사실을 추정하지 않는다. 사용자가 DATA_GO_KR_SERVICE_KEY를 Secret/로컬 env로 주입했다면 live adapter smoke부터 진행한다.
