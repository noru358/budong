# UPDATE PIPELINE V1

작성일: 2026-09-29  
상태: **GATE 2 UPDATE AUTOMATION BASELINE IMPLEMENTED**

## 목적

재개발·재건축 데이터는 API만으로 최신성을 유지할 수 없다. 따라서 V1은 다음 파이프라인을 사용한다.

```text
SOURCE SENSOR
  ↓
SNAPSHOT / API FETCH
  ↓
DIFF
  ↓
CHANGE CANDIDATE
  ↓
PROJECT MATCHING / DOCUMENT PARSING
  ↓
OFFICIAL EVIDENCE VERIFICATION
  ↓
FACT_ASSERTION / PROJECT_STAGE_EVENT / RIGHTS_REGULATION_EVENT
  ↓
UI CURRENT STATE
```

핵심 규칙:

> **발견(discovery)과 확정(official confirmation)은 분리한다.**

## 센서 계층

### 1. API
- RTMS 실거래: 일 1회
- Building HUB: 필요 시 + 주기 재검증
- 정형 데이터이므로 adapter가 직접 normalize 가능
- 그래도 source lineage와 observed_at은 필수

### 2. 정보몽땅
서울 25개 자치구 사업장 목록을 일 1회 snapshot 감시한다.

목적:
- 신규 사업장 등장 감지
- 기존 사업장 목록 변화 감지
- 현재단계 표시 변경의 discovery signal

현재 baseline은 HTML fingerprint watcher다.
source-specific row parser가 붙기 전에는 페이지 변화가 곧바로 PROJECT/STAGE 사실이 되지 않고 `NEEDS_PARSER` 후보만 만든다.

향후 row parser 연결 후:

```text
어제 project snapshot
vs
오늘 project snapshot
→ NEW_PROJECT / STAGE_CHANGED / PROJECT_MISSING
```

을 생성한다.

### 3. 서울시 + 25개 자치구 고시·공고
법적 사업단계의 정본 verifier.

우선 키워드:
- 정비구역
- 정비계획
- 재개발
- 재건축
- 재정비촉진
- 조합설립인가
- 사업시행계획인가
- 관리처분계획인가
- 사업시행자 지정
- 신탁
- 권리산정기준일

목록 parser → 문서 parser → 첨부 PDF/HWP parser 순으로 jurisdiction adapter를 추가한다.

고시·공고 후보가 기존 PROJECT와 매칭되면 고시번호/발행기관/고시일/효력일/원문 locator를 검증한 뒤에만 OFFICIAL_CONFIRMED로 승격한다.

### 4. 서울플랜+ SHP
주 1회 catalog version 감시.

- 신규 파일 버전 탐지
- spatial diff 후보
- 개인 V1에서 `ADMIN_CANDIDATE`
- 법적 효력 없음
- 공공누리 제4유형 → commercial readiness RED
- 상용판 OFFICIAL boundary로 자동 승격 금지

## 자동화 수준

### 자동 가능
- source fetch
- snapshot/hash
- 신규 버전 탐지
- parsed project list diff
- entity candidate matching
- change candidate 생성
- source lineage 기록
- API 실거래/건축물 갱신

### 자동 + 검증 필요
- 사업단계 변경
- 신규 정비구역
- 사업시행자/신탁방식 변경
- 권리산정기준일
- 관리처분/사업시행 변경인가

### 자동 확정 금지
- 조합원 지위 PASS/FAIL
- 분양자격 확정
- 현금청산 확정
- 공식 경계로의 추정 polygon 승격
- 투자추천

## 운영 주기

| 대상 | 방법 | 주기 | 자동 확정 |
|---|---|---:|---|
| 정보몽땅 사업장 | HTML snapshot → parser/diff | 매일 | NO |
| 서울시 고시·공고 | notice diff | 매일 | 원문 검증 후 |
| 25개 자치구 고시·공고 | notice diff | 매일 | 원문 검증 후 |
| RTMS | API | 매일 | 거래사실 SOURCE_CONFIRMED |
| Building HUB | API | On-demand + 재검증 | 원천필드 SOURCE_CONFIRMED |
| 서울플랜+ SHP | version + spatial diff | 주 1회 | ADMIN_CANDIDATE only |

## GitHub Actions

`.github/workflows/update-watch.yml`

- 매일 07:20 KST 실행
- 수동 실행 가능
- previous state는 GitHub Actions cache로 복원
- 변화 후보는 artifact로 30일 보관
- main branch를 자동 변경하지 않음
- 첫 실행은 baseline만 생성
- 두 번째 실행부터 source change candidate 생성

## 이후 구현

1. 정보몽땅 source-specific project row parser
2. 서울시 고시 parser
3. 25개 구청 adapter registry
4. PDF/HWP text extraction
5. entity matcher
6. candidate → evidence → assertion 승인기
7. 오늘 바뀐 구역 UI
8. 변경 이력 timeline
