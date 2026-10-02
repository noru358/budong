# 출처별 개인·상업 이용 계약 — 2026-10-02

## 구현 범위

`data/source_registry.json`의 기존 출처 각각에 `use_policy`를 추가했다. 기존 readiness 색상은 상업 준비도 참고값으로 유지하며 개인 이용 가능 여부를 색상으로 차단하지 않는다. 원문 접근, 데이터 재사용, 가공, 지도 표시는 별도 작업으로 판정한다.

`src/source_policy.mjs`는 브라우저·서버에서 같은 판정을 사용한다.

```js
getSourceUsePolicy(sourceRecord)
listSourceUsePolicies(registry)
evaluateSourceOperation(sourceRecord, {
  mode: 'PERSONAL', // COMMERCIAL도 지원; 대소문자 무관
  operation: 'map_display'
})
evaluateDerivedSourceUse(upstreamSources, {mode:'COMMERCIAL', operation:'normalize'})
```

판정 결과에는 `enabled`, `status`, `reason`, `requires_attribution`, `conditions`가 있다. 상태는 `allowed`, `requires_review`, `noncommercial`, `no_derivatives`로 구분한다. 금지 작업은 추가로 `prohibited:true`를 반환한다. 허용된 개인 기능·출처는 계속 활성화되며 제한은 해당 출처와 해당 작업에만 적용한다.

라이선스 화면·출처 배지는 `labels.personal`, `labels.commercial`, `labels.modification`, `attribution_text`, `reviewed_at`, `conditions_url`, `scope_note`를 사용할 수 있다. 정책 확인 완료는 공식 사실의 확인이나 API 접속 성공을 의미하지 않는다.

## 현재 출처 계약

| 출처 | 개인 기능 | 상업 이용 | 가공·지도 |
|---|---|---|---|
| 국토교통부 실거래 API 6개·건축HUB API | 승인·호출 한도 안에서 조회·정규화 가능 | 제공 API 데이터 이용허락범위 제한 없음 | 정규화 가능. 필지/구역 연결의 정확성은 별도 검증 |
| 법령 문언·앱의 자체 해설 | 법령 원문 참고·해설 가능 | 문언은 저작권법 제7조 범위 | 사이트 디자인·별도 지도·제3자 자료에는 같은 허락을 적용하지 않음 |
| 정보몽땅·토지이음·서울시/송파구 고시·주간 목록 | 공개 원문 열람·제목/번호/날짜 등 개별 사실의 제한된 개인 참고 가능 | 원문·자료별 재사용 조건 확인 필요 | 전체 DB·첨부파일·도면 복제, 대량 수집, 경계 가공은 별도 확인 |
| 서울시 KOGL4 데이터 4개 | 출처를 표시한 비상업 원문·원파일 이용 가능 | 상업 이용 금지 | 변경·파생 제작 금지 유지. 변환 GeoJSON/클리핑/좌표변환은 개인 모드로 해제되지 않음 |
| VWorld WMS/WFS | 공식 사이트 열람 가능 | 특정 레이어·API 조건 미확인 | 개인 재사용·저장·가공·지도 조건을 아직 확인하지 못함 |
| OSM 표준 배경 타일 | 현재 화면의 정상적인 대화형 지도 조회 | 동일한 서버 정책·출처 조건 안에서 가능 | 대량/사전 수집·오프라인 기능 금지, 데이터 자체·다른 지도 출처와 분리 |
| USER_INPUT | 사용자가 직접 작성한 가격·일정·가정·위치 사용 가능 | 자체 입력 사용 가능 | 직접 작성한 위치/가정 사용 가능. 제3자 파일 업로드는 원출처 조건 유지 |

정보몽땅 등 공개 자료의 개인 참고 범위는 개별 사실·원문 연결을 위한 앱 계약이다. 공식 기관이 DB 전체 재배포나 자동수집을 허락했다는 주장이 아니다. 공식 고시 문언 자체가 저작권법 제7조에 해당하는지와 첨부 지도·설계자료의 권리는 구별한다. 출처 단위에 다양한 자료가 있으므로 기관 전체를 일괄 자유이용으로 표시하지 않는다.

## 직접 확인한 공식 근거

2026-10-02 제공기관 공식 catalog의 이용허락범위와 공공누리 안내를 확인했다. 아래 링크는 제3자 블로그의 해석을 대신하지 않는다.

공공데이터포털의 아래 7개 catalog에서 **이용허락범위 제한 없음**과 무료, 개발계정 10,000을 확인했다. 접근 승인·기한·운영계정 트래픽은 데이터 이용허락과 별도이다.

- [연립다세대 매매](https://www.data.go.kr/data/15126467/openapi.do)
- [단독/다가구 매매](https://www.data.go.kr/data/15126465/openapi.do)
- [아파트 전월세](https://www.data.go.kr/data/15126474/openapi.do)
- [아파트 매매 상세](https://www.data.go.kr/data/15126468/openapi.do)
- [아파트 분양권전매](https://www.data.go.kr/data/15126471/openapi.do)
- [아파트 매매](https://www.data.go.kr/data/15126469/openapi.do)
- [건축HUB 건축물대장](https://www.data.go.kr/data/15134735/openapi.do)

아래 서울시 4개 catalog에서 공공누리 제4유형을 확인했다. [공공누리 공식 유형안내](https://www.kogl.or.kr/info/license.do)는 제4유형을 비상업 이용만 가능·변형 등 2차적 저작물 작성 금지로 안내한다. 따라서 비상업 원파일 보기 기능은 활성화하고, 원파일을 수정하거나 파생 경계로 연결하는 권한과 구분한다.

- [도시계획 정비사업 현황 OA-20281](https://data.seoul.go.kr/dataList/OA-20281/A/1/datasetView.do)
- [도시계획 결정고시 OA-20283](https://data.seoul.go.kr/dataList/OA-20283/A/1/datasetView.do)
- [의제처리구역 위치정보 OA-20957](https://data.seoul.go.kr/dataList/OA-20957/F/1/datasetView.do)
- [서울플랜+ 사업공간 OA-22712](https://data.seoul.go.kr/dataList/OA-22712/F/1/datasetView.do)

[저작권법 제7조](https://www.law.go.kr/lsLinkCommonInfo.do?lsJoLnkSeq=1029423769)를 **시행 2026-08-11, 법률 제21336호** 기준으로 확인했다. 법령, 국가·지자체 고시·공고 등이 저작권 보호 대상에서 제외되는 문언을 확인했다. 그 조문을 전체 기관 웹사이트·지도·제3자 설계자료·DB 이용조건의 포괄 허락으로 사용하지 않는다.

## 지도·GeoJSON 연결 계약

[OSM 표준 타일 공식 정책](https://operations.osmfoundation.org/policies/tiles/)에 따라 현재 화면에 필요한 타일만 HTTPS로 조회한다. 지도에 `© OpenStreetMap contributors`와 [저작권 링크](https://www.openstreetmap.org/copyright)를 항상 표시하고 브라우저 Referer 및 HTTP 캐시를 준수한다. `no-referrer` 응답 정책은 이 사용과 맞지 않으므로 지도 구현에서는 Referer가 전달되도록 설정한다. 별도 배경 지도 출처를 선택할 때에는 새 출처의 자체 정책을 확인한다.

서버의 기본 동작은 개인 모드이며 `BUDONG_USE_MODE=COMMERCIAL`에서는 출처별 상업 정책을 다시 검사한다. 전체 구역 검색·개인 입력·공개 원문으로 이동하는 기능을 상업 미확인 출처 하나 때문에 일괄 끄지 않는다.

GeoJSON 가져오기 구현은 사용자 파일의 임의 `use_policy` 값을 신뢰하지 않고 통제된 registry의 `source_id`로 판정해야 한다. 업로드만으로 원출처 제한이 USER_INPUT으로 바뀌지 않는다. 형식변환이 필요한 경우 `geometry_transform`, 지도 표시에는 `map_display` 판정을 각각 사용한다. 여러 출처를 섞은 결과는 해당 작업에 가장 제한적인 원출처 정책을 유지한다. 출처 이용 허락과 구역 포함 관계·법적 경계·권리 검증은 별도 속성이다.

## 원문 추가 탐색 및 남은 작업

상도15 사업시행자 지정 원 고시, 목동10 조합설립인가 원 고시, 독바위 은평구 제2026-37호 상세 원문은 아직 확정하여 연결하지 않았다. 동작구의회 회의록에 상도15 사업시행자 지정 언급이 발견되더라도 원 지정 고시일이나 역할을 추정하지 않는다. 대표지번을 구역 내 모든 필지의 공식 포함 관계로 승격하지 않는다.

추가로 [한남5 용산구 제2026-55호의 공식 PDF 첨부](https://www.eum.go.kr/web/gs/gv/gvGosiDet.jsp?seq=637767)를 실제 확보했다. 토지이음 EUC-KR 페이지의 다운로드 form은 같은 인코딩으로 POST해야 했다. PDF는 118페이지, 원파일 2,264,133바이트, SHA-256 `1666a7154dc2ac36cda177ca9b12984acc638b81913863a91643866850f7f52b`, 조회시각 2026-10-02 18:30:53 KST다. 고시 본문과 PDF6페이지(인쇄26페이지) 명세서의 첫 행을 텍스트 및 렌더 이미지로 대조했다. **동빙고동 33-13, 지목 대, 공부상 208㎡·편입 208㎡**가 수용/사용 토지 명세에 기재되어 있다. 이 사실은 2026-04-30 고시의 해당 필지 기재 사실이며 현행 구역 내 모든 필지의 포함 여부나 소유자의 분양자격을 확인한 결과가 아니다. 전체118페이지의 모든 소유·권리·조서를 검토했다고 표시하지 않는다. 데이터 담당에게 이 제한과 함께 단일 필지 근거를 전달했다.

데이터 담당은 [행정표준코드관리시스템 현행 법정동 코드](https://www.code.go.kr/stdcode/regCodeL.do?regionCd=1117013200&disuseAt=0&cPage=1&pageSize=10&searchOk=0)에서 `1117013200 = 서울특별시 용산구 동빙고동`을 확인하고 위 PDF 행을 독립적으로 시각 대조했다. 코드 페이지 조회시각은 `2026-10-02T09:35:12.072Z`, 응답 SHA-256은 `d707b431594ae241967c9b8f19901b438bb6d7e34297cc67152a789272b9ce54`다. 평지 33-13의 PNU는 `1117013200100330013`으로 연결한다. 기록의 시점은 고시일 2026-04-30이며 현재 포함 관계는 미검증으로 유지한다. 소유자 개인정보는 저장하지 않는다.

[목동10 지정 제2025-420호](https://www.eum.go.kr/web/gs/gv/gvGosiDet.jsp?seq=618080)의 PDF도 확보했다. 원파일 1,953,921바이트, SHA-256 `35bb4154a64db77950df02abf2b98ea8757ade85c101a3adbcec663dfa85625e`다. 지정 문서의 존재·내용 확인을 위한 자료이며 더 최신 조합설립인가 문서가 확보된 것은 아니다. 도면 좌표를 추정해 지도 경계로 변환하지 않았다.

이번 출처 작업의 테스트는 기존 상업 readiness와 개인 활성화의 분리, 비상업/변경금지의 독립 유지, 미검토 출처의 자동 허용 방지, API 데이터 가공 허용, 복합 출처 제한 상속, OSM 금지 작업, 사용자 입력/제3자 자료 구분을 확인한다.

`node --test tests/source_policy.test.mjs tests/real_data.test.mjs`에서 새 출처정책10개·기존 registry/실데이터7개, 총17개 통과했다. 전체 앱 및 지도·서버 연동 검증은 각 구현 담당의 통합 검증 결과로 따로 기록한다.
