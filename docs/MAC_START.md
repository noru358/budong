# 맥에서 budong 실행

이 안내는 GitHub 최신 main을 받거나 이전 `budong-personal-v1.zip`을 맥에 옮겨 실행할 때 사용한다. 후속 V2 변경은 GitHub main에 있으며 이전 ZIP에는 없다. 클라우드의 loopback 서버 주소는 맥의 서버 주소와 별개다.

1. ZIP을 풀고 터미널에서 압축을 푼 `budong` 폴더로 이동한다.
2. Node.js 22 또는 24가 설치돼 있는지 `node --version`으로 확인한다. 클라우드용 Linux Node 경로는 맥에서 사용하지 않는다.
3. 다음 명령으로 실행한다. 외부 npm 의존성이 없어 `npm install`은 필요 없다.

```bash
npm run serve
```

4. 서버 시작 문구가 나오면 브라우저에서 **http://localhost:4173/web/** 를 연다. 터미널을 닫으면 서버도 종료될 수 있다.

다른 프로그램이4173포트를 사용하면 다음처럼 실행하고 **http://localhost:4175/web/** 를 연다. 다른 프로그램의 프로세스를 임의로 종료하지 않는다.

```bash
PORT=4175 npm run serve
```

수동 물건 입력·저장·계산·비교에는 API 키가 필요 없다. 데이터는 해당 맥 브라우저에 저장된다. 클라우드 브라우저에서 입력한 물건이 맥 브라우저로 자동 동기화되지는 않는다.

실데이터 조회는 맥 실행 프로세스의 `DATA_GO_KR_SERVICE_KEY` 또는 기존 ignored `.env`를 사용한다. 제공 패키지에는 실제 키·`.env`·개인 물건 데이터가 포함되지 않는다. GitHub Actions의 실제 RTMS·Building HUB 스모크 성공 및 복사 블록 Secret 보정을 통합했다. 이 클라우드의 과거 임시 단일 키 오류10 기록과 실행환경이 다르므로 맥에서는 기존 키로 실제 스모크를 재확인한다.

기존 Linux Chromium 검증에 더해 Mac Chrome 격리 프로필에서 실행·검색·입력·계산·저장·비교·모바일 동선을 검증했다. Safari와 모든 실제 모바일 기기 검증은 별도다.
