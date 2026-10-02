# 맥에서 budong V3 실행

GitHub 최신 main을 받는다. 이전 `budong-personal-v1.zip`에는 V3 변경이 없다.

1. 터미널에서 최신 `budong` 폴더로 이동한다.
2. `node --version`으로 Node.js 22 또는 24를 확인한다.
3. `npm run serve` 후 **http://localhost:4173/web/** 를 연다. 앱 실행에는 `npm install`이 필요 없다.

다른 프로그램이 포트를 사용하면 `PORT=4187 npm run serve` 후 **http://localhost:4187/web/** 를 연다. 터미널을 종료하면 서버도 종료될 수 있다. 공개 접속용 서버가 아니다.

## 개인 데이터와 지도

수동 물건 입력·계산·저장·비교·백업 복원에는 API 키가 필요 없다. 자료는 해당 브라우저에 저장한다. 백업은 물건만 포함하며 지도 위치/경계·계정 동기화를 포함하지 않는다. 가져오기는 검사 후 기존 ID를 유지하며 병합한다. 원본 브라우저 데이터를 지우기 전에 백업한다.

배경지도는 온라인 OSM 타일을 사용한다. 출처가 지도에 표시되며 대량 다운로드·오프라인 수집 기능은 없다. 직접 작성한 위치·GeoJSON과 공식 검토 경계를 구별한다. `data/boundary_import_example.json`은 형식 확인용 가상 자료로 실제 구역 경계가 아니다.

## 실제 데이터 조회

`.env.example`의 변수명을 참고해 ignored `.env` 또는 서버 환경에 `DATA_GO_KR_SERVICE_KEY`를 등록한다. 키는 채팅·Git·로그에 넣지 않는다. GitHub Actions 기존 Secret으로 실제 조회 검증을 완료했지만 그 키가 로컬로 자동 전달되지는 않는다. 키가 없는 환경에서도 수동 기능은 사용 가능하다.

개인 모드는 기본 `BUDONG_USE_MODE=PERSONAL`이다. 향후 상업 검토 시 `COMMERCIAL`로 바꾸면 지도 파일 등 작업별 출처 조건을 다시 검사한다. 출처·이용조건 화면에서 개인/상업/변경 라벨과 근거 링크를 확인한다. 모드 변경 후 서버를 다시 시작한다.

## 검증

```bash
npm test
```

브라우저 자동 검증은 별도 Node Playwright 설치가 있는 환경에서 실행한다. 모듈 또는 Chrome/Chromium이 기본 위치에 없으면 해당 경로를 환경변수로 지정한다.

```bash
BUDONG_PLAYWRIGHT_MODULE=/path/to/playwright/index.js BUDONG_BROWSER_PATH=/path/to/chrome npm run test:browser -- --base-url http://127.0.0.1:4173
```

격리된 테스트 프로필과 가상 물건을 사용한다. 지도 타일은 테스트 응답으로 대체하여 외부 타일 서버를 호출하지 않는다. 실제 브라우저에서 배경지도가 표시되는 것까지 별도로 확인했으며 Safari와 모든 모바일 기기를 검증한 것은 아니다.
