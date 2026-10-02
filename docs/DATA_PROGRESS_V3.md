# Data 부서 V3 — 개인 실사용 조회

작성일: 2026-10-02 (Asia/Seoul). 개인 비상업 사용 목적에서도 응답 행의 구역 귀속·권리·경계 정확성을 추정하지 않는다.

이번 변경은 개인 서버에서 선택한 구역의 자치구/대표지번 문맥으로 실제 거래·건물을 조회하는 기능과, 제공기관의 실제 `totalCount`에 따른 전페이지 수집이다. 실제 조회의 완전성과 사업구역 내 데이터 연결을 따로 표시한다.

## 구현

- `fetchAllRtmsTrades` / `fetchAllBuildingTitles`: actual `totalCount`, `pageNo`, `numOfRows` 필수. 페이지 수/행수 일치, total 고정, 반복페이지 없는 상태에서만 `coverage=COMPLETE`로 반환한다.
- 기본 페이지100행·최대20페이지·수집예산60초. caller는 최대100페이지/1000행/120초 범위에서 설정할 수 있다. 상한 도달은 `PARTIAL_CAP` + `MAX_PAGES`이며 provider 전체건수와 수집건수를 함께 반환한다. 메타데이터 누락/형식오류, total 변동, 불완전페이지, 실패/타임아웃은 성공이나 무거래로 바꾸지 않는다.
- `pages`는 각 응답의 페이지번호/행수/전체건수를 보존한다. `request`에는 법정동·자치구·기간·번지 등 허용된 값만 저장하고 키/요청URL은 저장하지 않는다. 이번 기능의 source evidence는 정규화 행 + 요청/페이지 메타데이터다. 원 XML/JSON 전체 payload를 장기 저장하는 별도 adapter 저장계층은 아직 구현하지 않았다.
- `queryLiveProjectData`: 서버의 seed project를 사용해 해당 `borough_code`로 조회한다. 대표지번 끝의 번/지를 4자리로 맞춰 기본값을 제공하고 산/대지 구분을 보존한다. 법정동코드 `bjdongCd`는 사용자가 공식 코드를 확인해 입력해야 한다. 이름만 보고 코드나 PNU를 생성하지 않는다.
- 거래 서비스는 명시적 `serviceType` selector **RH(연립다세대 매매) / APT(아파트 매매 상세) / SH(단독/다가구 매매)**다. 기본 RH를 유지하며 사업유형만 보고 아파트/단독 자료를 자동 선택하지 않는다. source ID와 endpoint는 허용된 각 서비스의 동일 쌍으로 강제한다. SH의 연면적 `totalFloorAr`는 `total_floor_area_m2`로 보존하며 전용면적으로 표시하지 않는다. 건물은 대표지번/입력필지 참고 조회다.
- 기존 single-page 함수와 API도 유지한다. 새로운 전체조회 결과의 `project_linkage_validated=false`, `legal_rights_verified=false`는 공식 필지 검토와 연결 전까지 유지한다.

## 서버/UI 계약

`GET /api/projects/:id/reference?kind=rtms&dealYmd=YYYYMM&serviceType=APT`

`GET /api/projects/:id/reference?kind=buildings&bjdongCd=NNNNN&bun=NNNN&ji=NNNN&platGbCd=0`

API route는 PM/QA가 server에서 seed lookup, 허용 파라미터, 동시조회 제한과 오류 처리에 통합한다. Data helper는 `buildProjectReferenceQuery({project,kind,query})` / `queryLiveProjectData({project,kind,query,env,fetchImpl,observedAt})`다. 자치구를 client가 임의 덮어쓰는 query는 허용하지 않는다. Building `bun/ji/platGbCd`는 생략 시 엄격하게 파싱된 대표지번 기본값을 사용한다.

반환값은 `rows`, `total_count`, `page_count`, `pages`, `coverage`, `stop_reason`, `request`, `observed_at`, `scope`, `project_context_id`, `representative_lot`, `reference_label`, `status`다. status는 `DATA_RECEIVED`, `EMPTY_RESULT`, `PARTIAL_RESULT`. scope는 거래 `DISTRICT_MONTH_REFERENCE`, 건물 `PARCEL_REFERENCE`다. COMPLETE는 해당 query의 provider 응답 전페이지를 모았다는 뜻이며 공식 구역 내 거래·건물 완전성의 뜻이 아니다.

## 기존 Secret 재사용 / 실제 검증

Live Data Smoke workflow에 `all_pages` 선택, `max_pages`, `num_of_rows`, `plat_gb_cd`를 추가했다. RH/APT/SH matrix는 같은 기존 Secret으로 서로 독립 조회하며 fail-fast를 끈다. workflow 입력10개 제한을 유지하면서 RH의 기존 artifact 이름을 보존하고 APT/SH artifact를 각각 추가한다. 전체조회는 `QUERY_COVERAGE_ONLY`로 보고하고 각 거래서비스와 건물서비스의 provider total과 페이지별 수집건수를 남긴다. 상한 도달은 `connectivity_ok=true`일 수 있으나 `ok=false`와 exit1로 전체조회 미완료를 드러낸다. 셸은 명시적 bash `set -o pipefail`로 실패를 artifact 업로드 과정이 숨기지 않는다.

기존 `DATA_GO_KR_SERVICE_KEY` repository Secret을 그대로 사용한다. 로컬환경에 실제 키가 없기 때문에 수정 workflow가 parent의 통합 커밋으로 원격에 올라온 뒤 Actions에서 실행한다. 첫 페이지 기반 V2 실호출 증거는 [실행36985318097](https://github.com/noru358/budong/actions/runs/36985318097)에서 두서비스10행씩 성공이다. 이 결과를 새 전페이지 기능의 성공 증거로 재사용하지 않는다.

### 실제 전페이지 조회 검증 (18:35 KST)

[실행36990692259](https://github.com/noru358/budong/actions/runs/36990692259), head `0545aa351421af0f75af13073fcf81a60348a3e8`. 세 matrix job과 각각의 JSON artifact를 내려받아 요청값·provider 전체건수·수집건수·페이지·완료조건을 직접 대조했다.

| 요청 | provider totalCount | 수집행 | 페이지 / 범위 |
|---|---:|---:|---|
| 동작구11590 / 202609 / RH | 39 | 39 | 1 / COMPLETE |
| 동작구11590 / 202609 / APT 상세 | 42 | 42 | 1 / COMPLETE |
| 동작구11590 / 202609 / SH | 5 | 5 | 1 / COMPLETE |
| 11590 / 상도동10200 / 대지0 / 0418-0000 표제부 | 16 | 16 | 1 / COMPLETE |

페이지당100행, 상한20페이지. 표제부 조회는 각 matrix에서 동일하게16행으로 확인했다. 실제 관찰시각은 `09:35:56.455Z`(SH), `09:35:57.273Z`(APT), `09:35:59.860Z`(RH)이며 서울18:35분이다. 이 실행은 세 거래서비스의 접근권한·실제응답·totalCount 종료를 확인했다. 각각 전체건수가100 미만이므로 실제 복수페이지 연속조회까지 확인했다고 주장하지 않는다. artifact는 checkout 밖 `../data-v3/live-smoke-36990692259/`에 보존했다.

## 검증

2026-10-02 adapter/smoke/project reference/linkage 대상44개 테스트 통과. 새9개 수집/참고조회 테스트는 2페이지·빈응답·cap·메타데이터 누락·total 변동·반복페이지·타임아웃·선택구역문맥·법정동코드 추정 방지·후속페이지 키제거·3종서비스 endpoint/source 일치·SH 연면적 분리를 검증한다. 추가 smoke2개 테스트는 cap의 exit판정과 두 서비스의 독립 실패진단을 검증한다. 실제 프로젝트 데이터로 위장한 fixture mapping을 만들지 않았다.

서비스 범위는 공식 [아파트 매매 상세 catalog](https://www.data.go.kr/data/15126468/openapi.do), [단독/다가구 매매 catalog](https://www.data.go.kr/data/15126465/openapi.do), [연립다세대 catalog](https://www.data.go.kr/data/15126467/openapi.do)에서 2026-10-02 재확인했다. 세 서비스는 자치구 코드 앞5자리와 계약년월 조회이며 공개 호실을 추정하지 않는다.

## 공식 구역 연결

V2의 검토된 필지 membership 계약을 유지한다. 한 필지라도 고시의 필지조서/도면과 법정동코드의 원문을 확인해 해당 구역과 연결해야 `REVIEWED_PARCELS_ONLY` 결과를 만들 수 있다. 법무팀과 같은5구역의 원문·첨부 검토를 진행한다. 대표지번만으로 공식 mapping을 만들지는 않는다.

한남5의 첫 실제 검토 필지 sample을 확보했다. 법무팀이 원고시 [용산구 제2026-55호](https://www.eum.go.kr/web/gs/gv/gvGosiDet.jsp?seq=637767)의118페이지 PDF 중 PDF6페이지(구보26페이지)의 ‘수용 또는 사용할 토지·건축물의 명세’ 첫 행을 렌더 대조했다. **동빙고동33-13, 지목 대, 편입208㎡**다. 첨부 SHA256은 `1666a7154dc2ac36cda177ca9b12984acc638b81913863a91643866850f7f52b`이며 개인정보/소유권자 내용은 복사하지 않았다.

Data는 [행정표준코드관리시스템 현행 조회](https://www.code.go.kr/stdcode/regCodeL.do?regionCd=1117013200&disuseAt=0&cPage=1&pageSize=10&searchOk=0)를 HTTP200으로 확인했다. ‘1117013200 서울특별시 용산구 동빙고동’ 행을 확인한 시각은 `2026-10-02T09:35:12.072Z`, 원문 SHA256은 `d707b431594ae241967c9b8f19901b438bb6d7e34297cc67152a789272b9ce54`다. 법정동과 지번을 조합한 sample PNU는 **1117013200100330013**이다. 코드13300은 동빙고동으로 사용하면 안 된다.

`HANNAM5_REVIEWED_PARCEL_SAMPLE`은 **2026-04-30 고시 시점의 한 필지**만 나타낸다. `sample_only=true`, `current_membership_verified=false`를 저장한다. 이 필지에 현재 건물이 조회되어도 정확한 표현은 ‘2026-04-30 편입필지의 현재 참고 건축물’이다. 현재 전체 사업구역 필지조서, 분양자격, 소유권, 입주권을 확인했다는 의미가 아니다. 스모크의11170/13200/대지0/0033-0013 요청은 이 알려진 sample에 한해 행별 필지 연결 및 제외이유를 검증하고 역사시점·원문/코드 근거와 count를 기록한다.

해당 sample의 실제 건물/거래 행 연결 결과는 후속 원격 실행 후 기록한다.

VWorld 공식문서의 도시지역 `lt_c_uq111`은 재개발·재건축 경계 대체자료가 아니다. 시장정비구역/주거환경개선지구도는 사업유형이 다르므로 목표5구역의 geometry로 표시하지 않는다. 허위 geometry 없이 경계 연결 검증을 계속한다.
