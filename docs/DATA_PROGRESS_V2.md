# Data 부서 진행 보고 — 2026-10-02

기존 GitHub Secret으로 현재 `main`의 두 공공 API 연결을 재검증했다. 서울 25구 공개 목록의 원문과 전수 baseline도 새 Mac 환경에 다시 보존했다. 다음 작업의 핵심은 **같은 5구역의 공식 검토된 필지와 거래·건물 행을 정확히 연결하는 것**이다. API 성공만으로 이 연결을 완료 처리하지 않는다.

## 이번 실행의 실제 증거

| 항목 | 결과 | 범위 |
|---|---|---|
| RTMS 연립다세대 매매 | OK / 10행 | 동작구 11590, 계약월 202609, page 1 / 최대 10행 |
| Building HUB 표제부 | OK / 10행 | 11590 / 10200 / 대지0 / 본번0418 / 부번0000, page 1 / 최대10행 |
| 정보몽땅 공개 목록 | 25구 / 1,184사업장 / 26페이지 | 원문 파싱·전체건수·페이지·식별자 검사 |
| 서울플랜+ catalog | OK | 파일 버전 발견용; 경계파일 변환·배포 없음 |
| Watcher | 필수오류0 / 후보0 | 새 환경의 최초 baseline; 이전 서버 대비 변화 없음이라는 뜻은 아님 |

API 관찰시각은 `2026-10-02T08:39:56.730Z`(서울 17:39:56)이다. [Live Data Smoke 실행](https://github.com/noru358/budong/actions/runs/36985318097)은 커밋 `e7f40c89ac354f3b05ad08ac60af805ce25d296b`에 대해 성공했다. 저장소의 `DATA_GO_KR_SERVICE_KEY` Secret을 그대로 재사용했으며 키 값을 읽거나 재등록하지 않았다. 이번 Mac 프로세스에는 해당 키와 VWorld 키가 주입되어 있지 않다. 사용자 키 추가 공유는 필요하지 않다.

원래 실행의 API artifact는 `scope=CONNECTIVITY_ONLY`, `project_linkage_validated=false`다. 10행은 첫 페이지 응답 수이며, 사업구역 내 실거래10건이나 구역 내 건축물10개를 뜻하지 않는다. 요청 상도동418은 연결 예시다. 현재 정보몽땅의 상도15 대표지번은 상도동279이며, 대표지번 자체도 전체 사업구역 필지의 검증된 membership을 대신하지 않는다.

checkout 밖 `../data-v2/`에 원문27파일, `state.json`, `candidates.json`, `last-run.json`, `live-smoke-36985318097/summary.json`을 보존했다. 상태 SHA256·전체 스냅샷·후보 이력 validator와 원문파일 존재 검사 모두 통과했다. 원문/키/환경 파일은 Git에 넣지 않는다. 이 경로의 증거는 이 Mac의 로컬 자료이며 다른 머신에 Git pull로 이전되지 않는다.

## 구현 완료

- `scripts/live_data_smoke.mjs`: 허용된 숫자 요청값·페이지·행수만 결과에 기록하며 URL/키/endpoint override는 기록하지 않는다. 성공도 `FIRST_PAGE_ONLY`, 실패는 `UNVERIFIED` 범위를 명시한다. 이 변경은 위 Actions 실행 이후의 로컬 구현이며 새 형식의 원격 실행 결과를 얻었다고 주장하지 않는다.
- `src/adapters/data_go_kr.mjs`: Building HUB의 `platGbCd`를 `plat_gb_cd`로 보존한다. 대지와 산을 동일 필지로 합치지 않는다.
- `src/adapters/project_linkage.mjs`: 공식 필지 membership을 사람이 검토한 mapping을 받아 정확한 필지 연결과 source lineage를 반환한다. 구/법정동/지번 불일치, 마스킹 지번, 불완전 identity, 중복·모호한 필지, 취소일이 있는 거래, 유효하지 않은 실제 날짜는 연결하지 않는다. 구역 내 호실·분양권·권리·법정단계는 확정하지 않는다.
- 연결 결과의 `scope=REVIEWED_PARCELS_ONLY`, `match_scope=PARCEL_ONLY`를 유지한다. 양쪽 source에 행이 있어도 완전한 API coverage 또는 G2 완료로 승격하지 않는다. 현재 실제 프로젝트 mapping은 생성하지 않았다.

mapping은 **신뢰된 검토자 입력 계약**이다. `OFFICIAL_CONFIRMED` 플래그나 URL 문법 검사만으로 출처기관의 진위·고시 첨부 전체 검토를 인증하지 않는다. 검토자가 고시의 필지조서/도면 및 해당 시점 범위를 확인하고 source locator와 관찰/검토일을 넣어야 한다. 대표주소나 AI가 추측한 법정동코드로 mapping을 생성하면 안 된다. RTMS 취소일 필드가 있는 행은 제외하지만, 모든 제공서비스의 취소·정정 이력 완전성을 이 모듈이 증명하지는 않는다.

## 허용 경계 원천 조사

Mac의 native fetch로 [VWorld 공식 WMS/WFS 문서](https://www.vworld.kr/dev/v4dv_wmsguide2_s001.do)를 HTTP200으로 읽었다. 이전 환경의 CONNECT403과 web 도구의 timeout은 이 Mac 전체의 접근불가를 의미하지 않는다. 외부 공개 문서는 scripts를 제거한 HTML로 `../data-v2/vworld-wmsguide.html`에 보존했다.

공식 표의 `lt_c_uq111`은 **도시지역**, `lt_c_ub901`은 **시장정비구역**, `lt_c_ud601`은 **주거환경개선지구도**다. 일반 예제의 `lt_c_uq111`을 재개발/재건축 구역 경계로 사용하면 안 된다. 조사한 표에서는 목표5구역을 포괄하는 재개발/재건축 정비구역 layer를 확인하지 못했다. 이는 모든 VWorld 서비스에 해당 자료가 없다는 판정은 아니다.

[공공데이터 catalog 15058773](https://www.data.go.kr/data/15058773/openapi.do)은 출처표시 제1유형, [15123895](https://www.data.go.kr/data/15123895/openapi.do)는 이용허락범위 제한 없음으로 표시된다(2026-10-02 확인). 허용조건과 실제 필요한 geometry의 존재·최신성은 각각 확인해야 한다. VWorld WFS 문서는 별도 API key와 등록 domain을 요구하며, EPSG4326 BBOX는 위도/경도 순, WFS2.0에서 `count`와 `startindex`를 설명한다. 실제 인증 호출·경계파일·5구역 feature 확인은 미완료다.

서울플랜+ 공공누리4 자료는 기존 제한을 유지한다. SHP 변환/지도배포 허락을 확보했다고 주장하지 않는다. 현재 지도 guard를 해제할 근거는 아직 없다.

## 검증과 다음 작업

Adapter/smoke/linkage/watcher/parser 대상 51개 테스트 통과 후 날짜 roundtrip 검증 테스트1개를 추가하여 linkage6개 재통과했다. 부모 PM/QA가 변경 통합 후 전체 테스트·브라우저 검증을 수행한다. 실제 데이터 행을 fixture로 만들어 검증 성공을 가장하지 않았다.

1. 상도15·한남5·잠실5·목동10·독바위의 원 고시 필지조서/경계 버전과 검토일을 확정한다.
2. 기존 Actions Secret을 이용하는 수집 경로에 페이지 전체 수집·키 제거 원문/요청 lineage artifact를 연결한다. 이는 smoke 첫10행 요약과 별도 작업이다.
3. 같은5구역의 reviewed parcel mapping으로 거래·건물 행을 연결하고 불일치·취소·미연결 이유를 검토한다. 구역에서 거래가 없으면 유효한 무거래와 미수집을 분리한다.
4. 허용된 경계 source의 실제 목표5구역 feature와 원 고시 도면을 대조한 뒤 UI 지도 연결을 진행한다.

이번 단계에서 G2는 진행 중이다. 공식 경계, 최소5구역 거래·건물 연결, API 전페이지 coverage의 필수 검증이 남아 있다.
