# budong

서울 재개발·재건축 구역을 찾고, 공식 단계·근거를 확인한 뒤 사용자가 발견한 물건의 자금·손익을 비교하는 개인 V1 웹서비스.

## 현재 상태 — 2026-10-02

**개인 물건 입력·저장·분석·비교 V1을 복구·업로드하고 V2 탐색/근거/반응형 개선을 통합했다. GATE 2 실데이터 통합은 진행 중이다.**

- 홈: 서울 44구역, 최근 본 구역, 분석 중인 물건.
- 검색: 실제 구역 이름·안전한 축약명·대표지번·부분일치·오타 검색. 검증된 역 자료는 아직 미연결.
- 상세: 관찰값과 법적 사건 분리, 공식 용어 설명, 등록 근거 원문 링크, 정책·사업시행자·권리 미확인 상태.
- 물건: 실제 구역에 수동 입력, 초안 저장, 수정·삭제, 브라우저 재방문, 사용자 선택 비교, JSON 내보내기.
- 계산: 초기·추가·최대 자기자금, 경제적 비용, 세전손익, MOIC·날짜별 XIRR·BEP, 자금 시간표·부족일, 공개된 시나리오 가정.
- 실데이터 조회: 서버에서 키를 사용해 연립다세대 거래·건축물 조회. 키는 브라우저에 전달하지 않는다.
- 지도: 검토된 경계 파일이 없어 현재 FAIL-CLOSED. 근거·검토·이용조건을 만족하는 GeoJSON이 연결되면 구역 경계를 표시한다.
- 업데이트: DAILY/WEEKLY 주기, 실패 판정, 이전 성공 상태·누적 후보 보존, 선택적 원문 보존. 실제 정보몽땅 목록 parser로 서울25구·1,184개 사업장 전수 baseline을 수집했다. 공식 검토 후 사실 반영과 UI 자동 갱신은 미완료.

44개 기본 구역 정보는 **2026-09-28 관찰값**이다. 원격 main의2026-10-02 기록에 따르면 GitHub Actions에서 **RTMS·Building HUB Live Data Smoke가 성공**했다. 포털 복사 블록이 Secret에 들어간 문제를 실제 키 후보 추출·인증 거절 시 후보 재시도로 해결한 upstream 변경을 통합했다. 이 클라우드에서 임시 단일 키로 호출한 HTTP400/code10과 사용자 포털의000/OK는 별도 환경의 과거 진단 기록이다. mock 테스트·접속 성공이 대표5구역의 실제 거래/건물 연결이나 최신 단계 검증을 뜻하지 않는다. 다음 환경에서 주입된 키로 스모크를 재확인하고 프로젝트 연결을 이어간다.

## 실행

맥에서 실행할 때는 [맥 실행 안내](docs/MAC_START.md)를 따른다. 최신 실행 패키지를 풀어 Node22/24로 시작하면 앱 주소는 `http://localhost:4173/web/`이다. 현재 클라우드에서 실행 중인 loopback 주소가 사용자 맥에 자동으로 연결되는 것은 아니다.

Node.js 22.23.3 또는 24, Python 3을 사용한다. 외부 npm 의존성·빌드·DB 서비스는 현재 필요 없다. 기존 격리 checkout을 사용하고 별도 worktree를 만들지 않는다.

클라우드의 검증된 Node 활성화:

```bash
export PATH="/workspace/.budong-onboarding/tools/node-v22.23.3-linux-x64/bin:$PATH"
cd /workspace/budong
npm test
npm run serve
```

기본 서버는 loopback의 4173 포트에서 실행하며 앱 경로는 `/web/`이다. 스냅샷 복원 후 서버를 다시 시작한다. 다른 포트는 `PORT=4175 npm run serve`로 설정한다. 개인용 서버이며 공개 배포·인증·사용자별 서버 저장은 아직 검증하지 않았다.

API 키는 환경 설정에 `DATA_GO_KR_SERVICE_KEY`로 안전하게 등록하거나, 로컬에서 기존 `.env.example`의 변수명을 참고해 ignored `.env`에 직접 설정한다. `serve`와 `smoke:live`는 `.env`가 있으면 로드한다. 키를 채팅·커밋·로그로 전달하지 않는다.

```bash
npm run smoke:live -- --deal-ymd 202609
```

스모크는 RTMS와 Building HUB의 접속·데이터 유무·제공기관 오류를 각각 보고한다. 유효한 빈 응답은 `NO_ROWS`이며 구역 내 거래나 5개 구역 연결 완료가 아니다. 공식 문서로 확인한 건축물 endpoint는 `--building-endpoint`로 지정할 수 있다. 목적지는 HTTPS `apis.data.go.kr`로 제한하며 TLS 검증을 유지한다.

## 검증

- `npm test`: **139 tests / 139 pass / 0 fail / 0 skipped** (2026-10-02, Mac Node 24.18.0).
- 서버 실행 후 `npm run test:browser -- --base-url http://127.0.0.1:4173`: 검색·원문 링크·수동 입력·계산·저장·복원·선택 비교·내보내기·미확인값·재방문·모바일·지도 가드·삭제 검증. 클라우드에 공급된 Python Playwright와 `/usr/bin/chromium`을 사용한다.
- GitHub Actions 실제 API 성공은 원격 기록에 보존돼 있다. 새 실행환경의 키 재사용·5구역 연동·경계 수집·공개 배포·경쟁제품 사용성 비교는 별도 검증이 필요하다.

저장한 물건은 이 브라우저의 localStorage에 남는다. 브라우저 데이터를 지우면 사라지므로 JSON 내보내기로 보관할 수 있다. 서버 DB·계정 동기화·내보낸 파일의 가져오기는 현재 지원하지 않는다.

업데이트 실행은 checkout 밖에 생성물을 두는 방식도 지원한다:

```bash
node scripts/run_update_watch.mjs --state /workspace/.budong-onboarding/update-watch/state.json --candidates /workspace/.budong-onboarding/update-watch/candidates.json --report /workspace/.budong-onboarding/update-watch/last-run.json --snapshots-dir /workspace/.budong-onboarding/update-watch/snapshots
```

## 정본과 다음 작업

- [PROJECT_DASHBOARD.md](./PROJECT_DASHBOARD.md): 부서별 완료·진행·외부 조건·사용자 액션.
- [REDEVELOPMENT_HANDOFF_v0.2_20260928.md](./REDEVELOPMENT_HANDOFF_v0.2_20260928.md): 제품 원칙과 CURRENT/NEXT.
- [V1_PROTOTYPE_CONTRACT.md](./V1_PROTOTYPE_CONTRACT.md): 화면·계산·공식 용어 계약.
- [docs/VALIDATION_V1.md](./docs/VALIDATION_V1.md): 이번 검증 결과·범위·외부 실패 기록.
- [docs/WORKSTREAMS_V1.md](./docs/WORKSTREAMS_V1.md), [docs/REAL_DATA_PLAN_V1.md](./docs/REAL_DATA_PLAN_V1.md), [docs/UPDATE_PIPELINE_V1.md](./docs/UPDATE_PIPELINE_V1.md): 부서 계약·실데이터 계획·수집 구조.

Legal·Data·Finance·Search·UX를 병렬 진행하고 PM/QA가 계약과 통합을 관리한다. 다음은 새 환경의 API 스모크 재확인, 최소5구역 거래·건물 연결, 이용조건을 만족하는 경계 확보, 고시/첨부 parser·후보 검토 후 사실 반영 및 본인 실제 매물 검산이다.

## 2026-10-02 후속 개선

아실·호갱노노·토스·Apple 공식 디자인 평가를 조사해 데스크톱 사이드바/모바일 하단탭, 검색필터, 명확한 시작 동작, 유형/권리 근거, 입력 구간 바로가기·비교패널을 적용했다. 지역+구역명 복합검색과 검토필지 연결 계약을 구현했다. 실제 API는 기존 Actions Secret으로 두 서비스 각10행 연결을 재확인했다. 상세한 완료범위와 다음 배정은 [부서 작업판](PROJECT_DASHBOARD.md), [디자인 조사](docs/DESIGN_RESEARCH_V2.md)를 따른다.
