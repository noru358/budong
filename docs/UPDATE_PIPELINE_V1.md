# UPDATE PIPELINE V1

> 2026-10-02: runner는 실제 DAILY/WEEKLY 간격을 적용하고 필수 센서 실패에 exit1을 반환한다. 성공 상태와 누적 candidates를 보존하고 원자쓰기·손상파일 오류·--report 및 --snapshots-dir 옵션을 지원한다. 정보몽땅 실제 목록 파서와 25구 1,184개 사업장 baseline 수집을 검증했다. 공식 원문 검토·승인 후 사실 저장/UI 반영은 미완료다.

작성일: 2026-09-29
갱신일: 2026-10-02
상태: **서울 사업장 전수 목록 파서·후보 자동 생성 구현, 법적 원문 검증 단계는 별도**

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

`SEOUL_CLEANUP_PROJECT_LIST_V1`은 실제 공개 HTML의 사업장 표를 파싱한다. 자치구코드 필터, 모든 행의 자치구, 표의 열, 요청 페이지번호, 전체 건수, 행번호 범위 및 사업장 식별자 중복을 검증한다. 200 응답이어도 접근 차단·로그인·오류 페이지나 바뀐 표 구조이면 실패로 처리하고 기존 snapshot을 보존한다.

실제 동작구 응답에서 기본 10행×7페이지, 전체 61개를 확인했고 `pageSize=100` 요청이 61개 전체를 반환함을 검증했다. 100개를 넘는 자치구는 페이지 링크를 따라 전수 수집한 뒤 총행수·고유 사업장 식별자·자치구·페이지번호 검증을 통과해야 baseline을 갱신한다.

영등포구 실제 122개/2페이지 응답에서 `pageSize=100`일 때 두 번째 페이지의 표시 행번호가 10개 단위로 계산되어 중복되는 원천 표시 문제를 확인했다. 수집 완전성은 표시 행번호가 아니라 전체 건수·고유 사업장 ID·실제 페이지번호로 판정하며, 이 경우 보고서에 `SOURCE_DISPLAY_ROW_NUMBERS_REPEAT` 경고를 기록한다.

사업장명·사업구분·대표지번·표시단계·공개 cafe ID를 보존한다. 단계가 공란인 지역주택조합 행은 null로 두고 추정하지 않는다. 안정적인 cafe ID가 있는 사업장은 명칭 변경을 신규/누락으로 오인하지 않으며, 해당 ID가 없는 행은 이름을 식별자로 사용한다.

완전한 목록을 수집한 뒤:

```text
어제 project snapshot
vs
오늘 project snapshot
→ NEW_PROJECT / PROJECT_MISSING / PROJECT_NAME_CHANGED
  / STAGE_CHANGED / PROJECT_TYPE_CHANGED / REPRESENTATIVE_LOT_CHANGED
```

후보를 `NEEDS_OFFICIAL_VERIFICATION` 상태로 생성한다. 첫 실행 및 기존 HTML-only 상태에서의 파서 도입은 baseline만 만들고 후보를 생성하지 않는다. 내비게이션·공개자료건수·표시 순서 변화는 구역 사실 후보로 만들지 않는다. HTML watcher는 아직 파서가 없는 경계 catalog에 유지한다.

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
- 후보는 누적 보존하고 최신 실행 보고서를 별도로 저장
- 원문 HTML과 상태·후보·보고서는 artifact로 30일 보관
- 마지막 성공 관찰시각 기준으로 DAILY 24시간/WEEKLY 7일 주기 적용
- 필수 센서 HTTP/파서/타임아웃 오류는 비정상 종료; API 및 고시 adapter 미연결 그룹은 사유를 포함해 SKIPPED 표시
- 상태/후보 손상은 오류로 중단하고 초기화하지 않음
- 파일별 원자 저장 및 브랜치별 cache/concurrency 격리
- main branch를 자동 변경하지 않음
- 첫 실행은 baseline만 생성
- 두 번째 실행부터 source change candidate 생성

## 이후 구현

1. 정보몽땅 source-specific project row parser — 구현 및 실제 서울 25구 1,184개/26페이지 baseline 검증 완료
2. 서울시 고시 parser
3. 25개 구청 adapter registry
4. PDF/HWP text extraction
5. entity matcher
6. candidate → evidence → assertion 승인기
7. 오늘 바뀐 구역 UI
8. 변경 이력 timeline

## 실행과 검증

```sh
node scripts/run_update_watch.mjs --snapshots-dir runtime/update-watch/snapshots
node --test tests/updater.test.mjs tests/update_runner.test.mjs tests/update_cleanup.test.mjs
```

`--state`, `--candidates`, `--report`는 저장 경로를 바꿀 수 있고 `--timeout-ms`는 기본 요청 제한시간을 설정한다. 그룹별 timeout이 있으면 그 값이 우선한다. `--snapshots-dir`을 생략하면 원문 저장은 하지 않는다.

공개 네트워크 호출은 `environmentFetch`를 통해 환경 프록시와 정상 TLS 검증을 사용한다. 테스트는 실제 동작구 공개 표의 축약 fixture, 모의 두 페이지, 로컬 HTTP 서버를 사용해 baseline/변화/페이지 누락/오류/주기/상태 보존을 검증한다. 자동 후보 생성은 앱의 seed JSON이나 공식 법적 사건을 갱신하지 않는다. 다음 연결은 후보 검토 화면 및 공식 원문 검증·승인 이후의 사실 반영이다.

## 실제 네트워크 검증 결과 (2026-10-02 KST)

- 서울 25구 **1,184개 사업장 / 26개 목록 페이지**를 완전 수집했다. 원천에 포함된 지역주택·가로주택 등 전체 사업구분을 보존한 수치이며 앱의 재개발·재건축 seed 44개와 다른 모집단이다.
- 동작구 기본 페이지는 10행/7페이지였고 확대 페이지 요청은 61개를 한 번에 반환했다. 영등포구는 122개/2페이지를 수집했다.
- 첫 실행에서 24구와 경계 catalog는 성공했다. 영등포 원천의 중복 표시 행번호를 진단·처리한 재시도로 남은 1구도 성공했다. 최종 재시도는 필수 오류 0, exit0, 후보 0이다. 최초 관찰이므로 후보를 만들지 않는 것이 정상이다.
- 마지막 실행 보고서의 기존 24구·경계 `NOT_DUE`는 성공 상태를 불필요하게 재수집하지 않은 결과다. 저장된 25구 상태는 스키마·목록 해시·출처 계보 검사도 통과했다.
- 증거 파일: `/tmp/budong-update-live/state.json`, `/tmp/budong-update-live/last-run.json`, `/tmp/budong-update-live/candidates.json`, `/tmp/budong-update-live/snapshots/`. 이 임시 검증 산출물은 저장소에 커밋하지 않는다. 예약 실행에서는 기본 `runtime/update-watch/` 경로를 사용한다.
- 후보 자동작성 동작은 실제 표 fixture의 단계 변경·신규·누락·명칭 변경과 모의 전페이지 응답으로 검증했다. 실원천에 변화가 없었던 최초 관찰에서 변경 후보가 생겼다고 주장하지 않는다.
