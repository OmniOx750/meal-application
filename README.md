# GitHub Pages + Google Sheets 식수 신청 시스템

직원은 오늘의 중식·석식 메뉴와 마감시간을 확인하고 각각 `신청 / 미신청`을 선택합니다. 관리자는 날짜별 메뉴, 마감시간, 안내문, 사용 여부를 설정하고 신청 현황을 확인합니다.

## 포함 기능

- 오늘 날짜 자동 표시
- 중식 / 석식 메뉴 표시
- 중식 / 석식 각각 신청·미신청
- 중식 / 석식 마감시간 개별 설정
- 마감된 식사의 선택 자동 비활성화
- 이름 + 부서 + 날짜 기준으로 중복 제출 시 수정
- 관리자 비밀번호 인증
- 날짜별 신청 현황 및 인원 집계
- 모바일 / PC 대응

## 1. Google 시트와 Apps Script 설정

1. 새 Google 스프레드시트를 만듭니다.
2. 스프레드시트 상단에서 `확장 프로그램 > Apps Script`를 엽니다.
3. `apps-script/Code.gs` 내용을 Apps Script의 `Code.gs`에 붙여넣습니다.
4. 프로젝트 설정에서 `appsscript.json` 표시를 켠 뒤, 제공된 파일 내용으로 교체합니다. 이 단계는 선택 사항입니다.
5. `Code.gs` 맨 위의 값을 수정합니다.

```javascript
const SETUP = Object.freeze({
  ADMIN_PASSWORD: '원하는 관리자 비밀번호',
  ALLOWED_ORIGINS: ['https://깃허브아이디.github.io'],
  TIMEZONE: 'Asia/Seoul'
});
```

6. 함수 선택 목록에서 `setupProject`를 선택하고 실행합니다.
7. 최초 실행 시 Google 시트 접근 권한을 승인합니다.
8. 시트에 `식수설정`, `식수신청` 탭이 자동 생성되는지 확인합니다.

> 사이트 주소가 `https://아이디.github.io/저장소명/`이어도 origin은 `https://아이디.github.io`까지만 입력합니다. 커스텀 도메인을 사용하면 해당 origin을 추가합니다.

## 2. Apps Script 웹 앱 배포

1. Apps Script 우측 상단 `배포 > 새 배포`를 누릅니다.
2. 유형은 `웹 앱`을 선택합니다.
3. 실행 사용자는 `나`를 선택합니다.
4. 액세스 권한은 회사 환경에 맞춰 선택합니다. 일반 GitHub Pages에서 로그인 없이 사용할 경우 `모든 사용자`가 필요합니다.
5. 배포 후 `/exec`로 끝나는 웹 앱 URL을 복사합니다.

코드를 수정한 뒤에는 `배포 > 배포 관리 > 수정 > 새 버전`으로 다시 배포해야 적용됩니다.

## 3. GitHub Pages 설정

1. 이 폴더의 파일을 GitHub 저장소 루트에 업로드합니다.
2. `js/config.js`를 열어 Apps Script 주소를 입력합니다.

```javascript
GAS_WEB_APP_URL: 'https://script.google.com/macros/s/배포ID/exec'
```

3. 필요하면 `APP_TITLE`, `COMPANY_NAME`도 수정합니다.
4. GitHub 저장소에서 `Settings > Pages`로 이동합니다.
5. 배포 소스를 `Deploy from a branch`, 브랜치를 `main`, 폴더를 `/root`로 설정합니다.
6. 생성된 GitHub Pages 주소로 접속합니다.

## 사용 주소

- 직원 신청: `index.html`
- 관리자: `admin.html`

## Google 시트 구조

### 식수설정

| 날짜 | 중식메뉴 | 석식메뉴 | 중식마감 | 석식마감 | 안내문 | 사용여부 | 수정일시 |
|---|---|---|---|---|---|---|---|

### 식수신청

| 날짜 | 이름 | 부서 | 중식 | 석식 | 수정일시 |
|---|---|---|---|---|---|

## 운영상 주의

- 직원 로그인 기능이 없는 간단한 사내용 버전입니다. 이름과 부서를 아는 사람은 같은 신청 내용을 수정할 수 있습니다.
- GitHub Pages가 공개 저장소라면 HTML과 JavaScript 코드는 누구나 볼 수 있습니다. 관리자 비밀번호는 코드에 넣지 않고 Apps Script의 Script Properties에 해시로 저장됩니다.
- Apps Script 웹 앱 주소를 아는 외부 사용자의 직접 요청을 완전히 차단하는 인증 구조는 아닙니다. 민감한 인사정보나 보안이 필요한 데이터에는 회사 계정 로그인 또는 별도 서버 인증을 추가하세요.
- `ALLOWED_ORIGINS`는 응답이 지정한 사이트로만 전달되도록 제한합니다. GitHub Pages 주소가 바뀌면 `SETUP.ALLOWED_ORIGINS`를 수정하고 `setupProject()`를 다시 실행하세요.
