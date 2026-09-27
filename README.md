# budong

재개발·재건축 지도·검색·개별 물건 투자분석 프로젝트.

## 정본

1. [REDEVELOPMENT_HANDOFF_v0.2_20260928.md](./REDEVELOPMENT_HANDOFF_v0.2_20260928.md)
2. [V1_PROTOTYPE_CONTRACT.md](./V1_PROTOTYPE_CONTRACT.md)

설계가 변경되면 별도 요약 파일을 계속 늘리기보다 위 정본의 CURRENT/NEXT를 갱신한다.

## 현재 상태 — 2026-09-28

- **GATE 0 완료**: V1 Prototype Contract 확정
- Legal/Ontology, Data, Finance, Search, UX 5개 워크스트림 1차 착수 완료
- GATE 1용 fixture core 구현
  - project fixture 10개
  - investment case fixture 20개
  - 공식 단계명 + 쉬운 설명 분리
  - 권리·규제 unknown → NEEDS_REVIEW
- Search baseline 구현: exact > alias exact > prefix > substring > trigram fuzzy
- Finance baseline 구현: 초기 자기자금 / 향후 추가자금 / 최대 누적 자기자금 / 총 경제적 비용 / MOIC / XIRR / BEP
- PostgreSQL + pg_trgm 스키마 작성
- Source/License Registry 작성
- 홈 / 지도 / 검색 / 구역 상세 / 물건 분석·비교 5화면 fixture prototype 작성
- GitHub Actions에서 `npm test` 검증하도록 CI 연결

## 중요한 제한

- 현재 지도는 **fixture 좌표도**이며 공식 경계가 아니다.
- 현재 project/case는 **실제 투자판단용 데이터가 아니다.**
- 실제 단계·권리·규제는 원문 source adapter 연결 전 확정하지 않는다.
- 자동 투자추천·자동 법률판단은 V1 범위 밖이다.

## 다음

1. 공공데이터 서비스키 확보 및 실제 source adapter 연결
2. 서울 30~50개 구역 shallow seed + 5~10개 deep validation
3. 공식 경계/고시·공고/실거래/건축물 데이터 연결
4. 실제 매물 dogfood 후 GATE 2/3로 진행

구현 상세는 [docs/WORKSTREAMS_V1.md](./docs/WORKSTREAMS_V1.md)를 본다.
