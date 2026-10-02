# budong

서울 정비사업 구역을 찾고 공식 단계·근거를 확인한 뒤, 사용자가 발견한 물건의 자금·손익을 비교하는 개인용 웹앱.

## 현재 상태 — V3 / 2026-10-02

구역 탐색 → 근거 확인 → 물건 입력 → 저장·비교 흐름을 전면 재구성했다. 아실·호갱노노·Airbnb·Google Maps·Stripe·Linear·GitHub의 실제 화면 또는 공식 제품 자료에서 탐색·입력·정보 위계를 조사했다. [기획](docs/DESIGN_PLAN_V3.md), [조사·적용 기록](docs/RESEARCH_V3.md)을 함께 읽는다.

- 검색·자치구/유형 필터·연속 목록·이동/확대 가능한 배경지도·선택 요약. URL 조건 복원과 모바일 목록/지도 전환.
- 상세의 공식 근거·날짜·사업유형·시행방식·권리 확인 항목, 구역에서 바로 개인 물건 입력.
- 초안 저장·수정·삭제·재방문·선택 비교·JSON 내보내기·검사 후 백업 병합 복원. 기존 ID는 유지한다.
- 초기/추가/최대 자기자금·경제적 비용·세전손익·MOIC·XIRR·BEP·자금 시간표·시나리오. 중간 대출상환·보증금 반환 및 매도 시 잔여 부채를 반영한다. 미확인 금액은 null로 보존한다.
- 개인 위치 지정·직접 작성한 GeoJSON 가져오기. 출처가 다른 경계는 신뢰된 registry의 이용조건·검토 메타데이터를 확인한다. **실제 공식 구역 경계는 아직 연결하지 않았다.**
- 연립다세대/아파트/단독다가구 매매 및 건축물대장 전페이지 참고 조회. API 키는 서버에서 사용한다.
- 출처 20개의 개인 이용·상업 이용·변경 가능 라벨과 공식 조건 링크. 기본 PERSONAL, `BUDONG_USE_MODE=COMMERCIAL`로 작업별 상업 조건 재검사.
- 서울25구 사업장 목록 baseline·일/주 업데이트 수집·실패 및 누적 후보 보존. 후보 검토→공식 사실 자동 반영은 후속 작업이다.

44구역의 기본 정보는 **2026-09-28 관찰값**이다. API 조회 완료는 공식 구역 귀속·입주권 확인을 뜻하지 않는다. [실제 조회 검증](docs/DATA_PROGRESS_V3.md)에서는 RH/APT 복수페이지와 한남5의 **2026-04-30 편입필지 1건**에 대한 현재 건축물 참고자료의 정확한 PNU 연결을 확인했다. 5구역 전체 필지·경계·최신 권리 확인은 진행 중이다.

## 실행

Node.js 22 또는 24. 앱 실행에는 npm 패키지 설치·빌드·DB 서비스가 필요 없다. Leaflet 1.9.4와 BSD-2-Clause 고지를 저장소에 포함했다.

```bash
npm test
npm run serve
```

기본 주소는 `http://localhost:4173/web/`이며 서버는 loopback에만 바인딩한다. 다른 포트는 `PORT=4187 npm run serve`. [맥 실행 안내](docs/MAC_START.md)를 따른다. 현재 작업 미리보기는 `http://127.0.0.1:4187/web/`이다. 다른 머신으로 서버 프로세스가 이전되지는 않는다.

수동 입력·계산·저장·지도는 공공데이터 API 키 없이 사용할 수 있다. 지도는 현재 화면에 필요한 OSM 타일만 조회하며 출처 표시를 유지한다. 로컬 실데이터 조회에는 `DATA_GO_KR_SERVICE_KEY`를 환경변수 또는 ignored `.env`로 안전하게 설정한다. `.env.example`에는 변수명만 있다. 키를 채팅·커밋·로그에 넣지 않는다. 기존 GitHub Actions Secret은 그대로 재사용했으며 로컬에 자동 복사되지 않는다.

```bash
npm run smoke:live -- --deal-ymd 202609 --service-type APT --all-pages true --num-of-rows 10
```

조회 인수는 `--deal-ymd YYYYMM`, `--service-type RH|APT|SH`, `--all-pages true|false`, `--num-of-rows N`, `--max-pages N`이며 각각 값을 붙인다. 건물은 `--sigungu-cd`, `--bjdong-cd`, `--bun`, `--ji`, `--plat-gb-cd`로 지정한다. 유효한 빈 응답, 부분 수집, 제공기관 실패를 구별한다. 개인 물건과 지도 입력은 해당 브라우저의 localStorage에 저장한다. 물건 백업은 USER_CASES_ONLY이며 지도 자료·계정·서버 동기화를 포함하지 않는다.

## 검증

- `npm test`: **174 tests / 174 pass / 0 fail / 0 skipped** (Mac Node24, 2026-10-02).
- Node Playwright 격리 Chrome 브라우저: 검색·원문·입력·중간 상환·저장·비교·백업 복원·미확인값·필터/뒤로가기·지도 위치·경계 가져오기·잘못된 파일 보존·1440/768/390/320px·출처 라벨·삭제 통과. 자동 테스트는 외부 지도 타일을 요청하지 않는다.
- 실제 Codex 브라우저에서 OSM 지도와 출처가 표시되는 현재 화면을 확인했다.
- [Actions 실제 API 검증](https://github.com/noru358/budong/actions/runs/36991292437): 용산구202609 RH11/11(2페이지), APT16/16(2페이지), SH2/2, 건물1/1. 구역 전체 검증과 구분한다.

브라우저 검증에는 별도 Node Playwright와 Chrome/Chromium이 필요하다. `npm run test:browser -- --base-url http://127.0.0.1:4173`를 실행하며, 모듈/브라우저가 기본 위치에 없으면 `BUDONG_PLAYWRIGHT_MODULE`과 `BUDONG_BROWSER_PATH`에 경로를 지정한다. 실제 입력자의 자료는 테스트하지 않았다. Safari·실제 모바일 기기·사용자 연구는 미검증이다.

## 정본·부서 보고

- [현재 구현·검증·제한](docs/IMPLEMENTATION_V3.md)
- [부서별 완료와 다음 작업](PROJECT_DASHBOARD.md)
- [출처별 이용조건](docs/SOURCE_USE_V3.md)
- [인수인계](REDEVELOPMENT_HANDOFF_v0.2_20260928.md)
- [초기 제품 계약](V1_PROTOTYPE_CONTRACT.md), [이전 검증 기록](docs/VALIDATION_V1.md)

공개 상업 배포는 이번 작업에 포함하지 않는다. 개인 모드에서도 원출처의 변경 금지·지도 이용조건은 유지한다. 부동산 포털의 사진·지도·디자인 자산을 복제하지 않았다.
