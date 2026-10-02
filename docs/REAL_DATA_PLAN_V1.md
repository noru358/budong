# REAL DATA PLAN V1

> 2026-10-02 통합: 원격 main의 RTMS·Building HUB Live Data Smoke PASS 및 복사 블록 Secret 추출 보정을 보존했다. 이 세션의 HTTP400/code10은 별도 클라우드 임시 키 진단이다. 새 세션의 기존 키로 smoke 재확인 후 최소5구역 거래/건물/경계 연결을 이어간다. 수동 입력·저장·비교, 실제 서울25구 목록 parser, 5구역6고시 본문 재검토는 구현·검증했다.

작성일: 2026-09-28  
상태: **GATE 2 — REAL DATA INTEGRATION IN PROGRESS**

### 2026-09-28 구현 체크포인트
- shallow seed 44개: DONE
- deep target 10개: DONE
- 공식 고시 evidence 1차 연결: IN PROGRESS
- RTMS / Building HUB adapter code: DONE
- API 활용신청: USER CONFIRMED DONE
- API live smoke: WAITING FOR SECRET INJECTION
- real-seed 홈/검색/상세 UI: DONE
- official boundary: NOT DONE

## 1. 현재 전환

GATE 1의 synthetic fixture 구조를 유지한 채 실제 서울 데이터로 치환한다.

- 실제 서울 정비사업 seed: **44개**
- deep validation target: **10개**
- 현재단계 discovery source: 서울시 정비사업 정보몽땅
- 단계 효력일/권리·규제의 최종 근거: 서울시·자치구 고시·공고 원문
- 실거래: 국토교통부 RTMS 계열 API
- 건축물: 국토교통부 Building HUB
- 경계: 공식성 + 상업적 이용 가능성을 함께 만족하는 source를 선택하기 전까지 NEEDS_REVIEW

## 2. Source hierarchy

### A. 사업장 discovery / 현재 표시단계
**서울시 정비사업 정보몽땅**

용도:
- canonical 사업장명 후보
- 서울시 사업구분 원문
- 대표지번
- 조회 시점 현재 진행단계

제약:
- 여기의 현재 진행단계를 곧바로 법정 효력일로 사용하지 않는다.
- `stage_effective_date`는 고시·공고 원문이 연결될 때까지 null.
- source snapshot이라는 성격을 필드에 유지한다.

### B. 법적 효력일 / 단계이력 / 권리·규제
**서울특별시·자치구 고시·공고 원문**

```text
official notice
  → SOURCE
  → FACT_ASSERTION
  → PROJECT_STAGE_EVENT or RIGHTS_REGULATION_EVENT
```

최소 저장:
- 문서명
- 고시/공고 번호
- 발행기관
- 원문 locator
- 공고/고시일
- 실제 효력일(원문상 별도이면 분리)
- assertion predicate/value
- reviewed_at

AI는 권리·분양자격을 자동 PASS/FAIL 판정하지 않는다.

### C. 실거래
우선 연결:
1. 연립다세대 매매
2. 단독/다가구 매매
3. 아파트 매매 상세
4. 아파트 전월세
5. 아파트 분양권전매

공통 키:
- 법정동 코드 앞 5자리
- 계약년월
- source row provenance

### D. 건축물대장
Building HUB에서 우선:
- 총괄표제부
- 표제부
- 전유부/전유공용면적
- 주택가격
- 지역지구구역

공개자료가 특정 호를 확정하지 못하면 호를 추정 생성하지 않는다.

## 3. Boundary policy

경계는 정확도와 라이선스를 동시에 만족해야 한다.

### 현재 결정
1. **개인 V1 참고경계:** 서울 열린데이터광장 `서울시 도시계획사업 현황(서울플랜+) 공간정보`
   - 2026-09 파일 확인
   - 재개발·재건축·신속통합기획 등을 포함
   - 데이터 자체가 법적 효력 없음을 명시
   - 공공누리 제4유형이므로 `RED`
   - `BOUNDARY_VERSION.kind = ADMIN_CANDIDATE`로만 허용
2. **상용판 후보:** VWorld 또는 별도 상업허용 공간원천. 특정 정비구역 layer의 정확도/범위 검증 전 `YELLOW`.
3. **법적 정본:** 고시 첨부 도면/좌표. 자동화 난도가 높더라도 필요 시 `OFFICIAL` boundary의 근거가 된다.

즉 개인 V1에서는 서울플랜+ SHP로 지도를 먼저 만들 수 있지만, 이를 법적 공식경계라고 부르지 않는다. 향후 상용화 시 RED lineage가 포함된 boundary는 자동 차단하고 대체 source를 연결한다.

## 4. 44-project shallow seed

정본 데이터: `data/seoul_seed_v1.json`

범위:
- 강남구 8
- 용산구 8
- 동작구 8
- 마포구 6
- 은평구 6
- 송파구 4
- 양천구 4

모든 seed의 current stage는 **2026-09-28 source snapshot**이다. 고시일을 모르면 날짜를 만들지 않는다.

## 5. Deep validation target — 10

1. **상도15구역** — 주택정비형 재개발 / 조합설립인가
2. **흑석9재정비촉진구역** — 주택정비형 재개발 / 착공
3. **한남5재정비촉진구역** — 주택정비형 재개발 / 사업시행인가
4. **청파2구역** — 주택정비형 재개발 / 조합설립인가
5. **공덕6구역** — 주택정비형 재개발 / 사업시행인가
6. **불광제5구역** — 주택정비형 재개발 / 관리처분인가
7. **잠실5단지** — 재건축 / 사업시행인가
8. **목동10단지** — 재건축 / 조합설립인가
9. **망원동 신속통합기획 후보지** — 정비계획 수립; 정책/행정 절차와 법정 stage 분리 검증
10. **독바위역세권** — 도시정비형 재개발 / 사업시행인가

선정 목적은 여러 사업유형·진행단계·정책경로를 한 번에 검증하는 것이다. “투자성 우수 순위”가 아니다.

## 6. Adapter contract

`src/adapters/contracts.mjs`

모든 adapter는 아래 pipeline을 지킨다.

```text
fetch
→ preserve raw
→ normalize
→ make FACT_ASSERTION
→ link lineage
→ validate
→ upsert
```

필수 규칙:
- secret 미설정 시 fail closed
- source_id 없는 사실 저장 금지
- effective_at과 observed_at 구분
- 라이선스 readiness inheritance
- API 원문 raw payload 또는 원문 locator 보존
- 파싱 실패를 0/빈 사실로 변환하지 않음

## 7. API key policy

실제 키는 절대 Git에 커밋하지 않는다.

로컬:
```text
DATA_GO_KR_SERVICE_KEY=...
```

향후 VWorld 사용 결정 시:
```text
VWORLD_API_KEY=...
```

`.env.example`에는 변수명만 저장한다.

## 8. Gate 2 exit criteria

Gate 2를 완료로 선언하려면:

- [ ] 최소 5개 deep target에서 실제 stage assertion + 공식 원문 연결
- [ ] 최소 5개 구역에서 실거래 데이터 연결
- [ ] 최소 5개 구역에서 건축물대장 연결
- [ ] 경계 source 및 kind 검증
- [ ] 모든 실제 fact에 source / reviewed_at / certainty
- [ ] 라이선스 lineage 적용
- [ ] synthetic fixture와 real data가 UI에서 명확히 구분
- [ ] QA pass

그 뒤에야 실제 매물을 넣어 GATE 3 Dogfood로 넘어간다.
