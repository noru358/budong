# 데이터팀 V5 — 실제 구역 지도 자료 확보

2026-10-03 KST. 이번 작업에서 서울도시공간포털이 공개 지도 화면에 사용하는 실제 정비사업 geometry를 확보했다. 기존 44개 사업장 seed 중 **42개에 행정 참고 경계**를 연결했다. 5개 우선 구역인 상도15·흑석9·한남5·청파2·공덕6을 모두 포함한다. 이 경계는 고시별 법적 현행 경계나 필지·권리 확인 결과로 승격하지 않는다.

## 원출처와 검토

- 공개 원문: https://urban.seoul.go.kr/view/map/main.html
- 원문 공개 프런트엔드 `content/map/mapInit_.js`, `mapBsnsInfo.js`에서 사용되는 동일한 서비스와 query를 확인했다. 내부 주소에 직접 접속하지 않고 원문이 사용하는 서울시 사이트의 same-origin proxy를 통해 조회했다.
- 공개 레이어: `UPIS/20200526_WFS/MapServer/12`, 이름 `UPIS_C_UQ120`, `esriGeometryPolygon`, 기능 `Map,Query,Data`.
- 요청: POST, 검토된 42개 `objectIds`, `outFields=*`, `returnGeometry=true`, `outSR=4326`, **`f=geojson`**. 서버가 네이티브 WGS84 GeoJSON을 제공한다. SHP 변환·대표주소 임의 좌표·다른 용도지역 레이어·제3자 지도 복제는 사용하지 않았다.
- 각 feature의 `OBJECTID`, `PRESENT_SN`, `SIGNGU_SE`, 원문 사업명과 `getBsnsInfo.json` 사업명·대표주소·구코드·분류를 대조했다. seed와 38개 대표주소가 그대로 일치하고 4개는 끝의 ‘일대’만 제외해 일치한다. 이름 별칭과 주소 원문을 좌표 없는 매핑 파일에 보존했다.
- 원문 지도는 법적 효력이 없는 참고 정보라는 안내를 제공한다. 공개 Query 기능 자체를 외부 재이용 허락으로 해석하지 않았다.

## 실제 확보 결과

| 자치구 | seed | 원출처 연결 경계 |
|---|---:|---:|
| 강남구 | 8 | 8 |
| 용산구 | 8 | 8 |
| 동작구 | 8 | 8 |
| 마포구 | 6 | 5 |
| 은평구 | 6 | 6 |
| 송파구 | 4 | 4 |
| 양천구 | 4 | 3 |
| 합계 | 44 | 42 |

최종 42개는 Polygon이며 좌표쌍 총 4,806개다. 원출처 분류는 공동 재건축 `BZ105` 17개, 주택정비형 재개발 `BZ103` 12개, 신속통합기획 `BZ101` 5개, 역세권 등 `BZ301` 4개, 도시정비형 재개발 `BZ102` 3개, 단독 재건축 `BZ104` 1개다. 후보지 분류도 **원문 분류 그대로** 보존하며 정비구역 지정 여부를 추정하지 않는다.

두 사업장은 미연결로 남긴다.

- `seoul-11440-05` 마포로1구역 제25지구: 해당 공개 레이어에서 대응 행을 확인하지 못했다.
- `seoul-11470-04` 신월7동1구역: 원문 대표주소 ‘신월7동 913번지 일대’와 seed ‘신월동 913’의 표기가 달라 주소 연결을 보류했다. geometry 후보가 있다는 이유로 자동 연결하지 않는다.

## 보관·이용 조건

법무 검토에 따라 이 경계는 **이 기기 내 PERSONAL / LOCAL_PRIVATE 사적 참고**에만 사용한다. 기관의 외부 재이용 허락을 확보한 자료는 아니다. 공개 서버·상업 모드·재배포는 허용하지 않는다. `data/boundaries_v1.geojson`은 Git ignored이며 실제 좌표를 테스트 fixture나 매핑 문서에 복사하지 않았다. 자세한 출처 정책은 `data/source_registry.json`의 `SEOUL_URBAN_PLAN_GEOJSON`에 있다.

raw response와 서비스 조사 자료는 checkout 밖 `../data-v5`에 보존했다. 공개 HTML의 외부 서비스 credential 값은 보존본에서 가렸다. 사용자 API key는 조회·저장·출력하지 않았다.

공유 가능한 구현은 `src/adapters/seoul_urban_boundaries.mjs`, `data/urban_boundary_mapping_v1.json`, `scripts/load_private_boundaries.mjs`다. 로더는 검토된 42개 OBJECTID만 단일 요청으로 조회한다. 원본 geometry와 출력 geometry가 같음을 검사하고, HTTP 오류·30초 timeout·불완전 응답·identity mismatch에서 기존 파일을 보존한다. 임시 파일을 mode0600으로 쓰고 rename으로 교체한다. 다른 컴퓨터에서는 `npm run map:load`로 개인 로컬 파일을 다시 확보할 수 있다.

## 검증과 증거

- 실제 로더 실행: HTTP200, 42개 native GeoJSON 수신·검증·저장 성공.
- 관찰시각: `2026-10-02T16:32:47.728Z` / KST 2026-10-03 01:32:47.
- 원본 응답 SHA256: `ef225d4cae026fcf16a033ceaad6c21dbab2ca36955bd7e8bd7795844b2d3752`.
- 원출처와 저장본의 각 geometry 직렬화 동일성: 42/42 PASS.
- `git check-ignore data/boundaries_v1.geojson`: PASS.
- 신규 adapter·로더 테스트 8개 PASS: district/name/PRESENT_SN/address/class mismatch, 중복·누락, 불완전 응답, HTTP 오류, timeout, PUBLIC/COMMERCIAL 사전 차단, geometry 유지, certainty 승격 차단, atomic write 실패 보존.
- 실제 UI 렌더링·loopback 제한·모드 전환 검증은 통합 담당의 최종 브라우저 검증 범위다.

## 다른 일차 원천 조사

정보몽땅의 사업장 목록은 현재 명칭·대표지번·단계 discovery 자료로 유용하지만 이번 조사에서 실제 사업장 polygon을 확인하지 못했다. 서울도시공간포털을 독립 대안으로 조사하여 실제 geometry를 확보했다.

VWorld 공식 WMS 레이어 안내 `https://www.vworld.kr/dev/v4dv_wmsguide2_s001.do`도 HTTP200으로 다시 확인했다. 이 문서에는 `UD602`, `UD603`, 재정비촉진 항목이 없었고 ‘정비구역’ 검색은 `lt_c_ub901` 시장정비구역만 반환했다. 다른 VWorld 데이터 다운로드 목록 전체에 없다는 결론은 내리지 않았다. 기존 `lt_c_uq111` 도시지역·`lt_c_ud601` 주거환경개선지구 등을 일반 재개발·재건축 경계로 대체하지 않는다. KOGL4 서울플랜+ SHP 형식 변경 경로도 사용하지 않았다.

## 재개발 서비스와 비교할 때의 실제 데이터 상태

아래 표는 경쟁 서비스의 데이터 품질을 추정한 표가 아니다. 사용자가 비교에서 요구한 기능에 대해 budong에서 실제로 확보한 범위를 보고한다. 경쟁 서비스의 화면·기능 비교는 디자인팀 보고서에 있다.

| 비교 요구 기능 | budong 실제 완료 | 남아 있는 범위 |
|---|---|---|
| 지도에서 실제 구역 확인 | 원출처 native Polygon 42/44 연결, 우선5 모두 확보 | 미연결2, 전국 범위, 외부 재사용 허락, 고시별 현행 법적 경계 검증 |
| 구역 사업 정보 | 정보몽땅 44개 discovery snapshot 및 원문 근거 | 날짜별 단계·법적 효력·원문 변경의 지속 검토 |
| 거래 조회 | RH/APT/SH 공식 API 전체 페이지 계약·실제 Actions 조회 검증 | 구역 내부 전체 거래 귀속을 위한 전체 공식 필지·주소 정규화·누락/마스킹 처리 |
| 건물 조회 | 공식 표제부 전체 페이지 계약·실제 Actions 조회 검증 | 구역 내 전체 건물·전유부·권리 자료 검증 |
| 실제 구역과 행 연결 | 한남5의 2026-04-30 고시 포함 필지 33-13 표본 1건 건물과 정확 일치 | 현행 전체 필지 또는 현재 입주권·분양자격 검증은 없음 |
| 경계와 거래·건물의 관계 | 지도 경계 및 district/month·입력필지 참고조회 | polygon이 생겼다는 이유로 지번 거래·건물을 공간적으로 귀속시키지 않음 |

이전 실제 API 검증: 용산 202609 RH11·APT16·SH2, 한남5 역사적 표본필지 건물1. RH/APT는 해당 표본필지 일치0, SH2는 필지 식별 불완전으로 미귀속이다. 현재 좌표가 확보되었어도 거래행의 공개 주소와 현행 공식 필지 목록이 충분하지 않으면 ‘구역 내부 실거래’라고 표시할 수 없다. V3 전체 run·실패·재시도 증거는 `docs/DATA_PROGRESS_V3.md`에 유지되어 있다.

다음 데이터 작업은 미연결2의 공식 identity 검토, 우선5 전체 고시 필지조서 구조화, 필지 기준 거래·건물 연결 및 누락률 산정이다. 지도 경계 확보는 이 후속 작업의 출발점이며 전체 필지 검증을 대신하지 않는다.
