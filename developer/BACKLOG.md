# 개발 백로그

## AWS 월간 리포트 통합

- 상태: 통합 구현·로컬 검증 완료 (`feat/aws-monthly-digest`) / AWS 배포 및 실서비스 연결 검증 전
- 원본 프로젝트: `/Users/baeseungdo/work/aws-monthly-digest`
- 목표: MSP 주간회고 사이트에서 Slack 로그인 한 번으로 AWS 월간 리포트 기능을 사용할 수 있게 한다.
- 구현 및 배포 안내: [월간 리포트 서비스](../services/monthly-digest/README.md)
- 완료: Slack 세션 기반 IAM Lambda 호출, MSP 편집 화면, 업로드·JSON 제한, XSS 방지, 원문 근거 보존, 선택 산출물 Slack 전송 코드, Terraform 및 이미지 빌드 절차.
- 검증: Node 73개·브라우저 10개·Python 13개 테스트, Lambda 컨테이너 빌드 및 읽기 전용 환경의 한글 PDF 생성. 실제 AWS/Bedrock/Slack 연결은 배포 후 확인한다.

### 권장 방향

- 사용자에게는 MSP 사이트 내부 기능으로 제공한다.
- PDF, Chromium, Bedrock을 처리하는 기존 Python/Lambda 백엔드는 별도 서비스로 유지한다.
- MSP 서버가 Slack 세션과 권한을 확인한 뒤 월간 리포트 백엔드로 요청을 전달한다.
- API 경로는 `/api/monthly-digest/*`처럼 기존 API와 분리한다.
- 공개 Lambda URL 대신 기존 EC2 역할의 `InvokeWithResponseStream` 호출로 연결한다.
- 프론트엔드는 전역 CSS와 JavaScript가 기존 MSP 화면과 충돌하지 않도록 독립된 화면으로 먼저 격리한다.
- Python 기능을 Node.js/EC2 구조로 다시 작성하는 전면 통합은 하지 않는다.

### 통합 전 필수 보완

- AI 결과와 가져온 JSON을 HTML에 삽입하는 구간의 XSS 방지
- 공용 비밀번호와 비밀번호 쿠키를 제거하고 MSP Slack 인증으로 교체
- 업로드 파일의 확장자, 개수, 용량 및 페이지 수 제한
- 서버에서 사용할 Bedrock 모델을 허용 목록으로 제한
- 사용자별 중복 실행 방지, 간단한 사용량 제한과 실행자 기록
- 분석, PDF 생성, Slack 알림의 최소 회귀 테스트 추가
- 사용되지 않는 모듈과 중복된 Slack 전송 코드 정리

### 단계별 적용안

1. 원본 월간 리포트 프로젝트의 보안과 입력 제한을 먼저 보완한다.
2. MSP 메뉴에 `AWS 월간 리포트` 진입점을 추가하고 독립 화면으로 연결한다.
3. MSP 인증 서버를 거치는 `/api/monthly-digest/*` 프록시를 구성한다.
4. 필요하면 실행자, 대상 월, 상태, 결과 파일, 오류만 저장하는 간단한 실행 이력을 추가한다.

### 규모 기준

14명 내외의 내부 사용자용이므로 별도 마이크로서비스 플랫폼이나 복잡한 작업 관리 시스템은 만들지 않는다. 기존 Lambda를 유지하고 인증·보안·화면 연결에 집중한다.
