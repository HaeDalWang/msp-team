# 새 디자인 B (개발 중)

기존 Express 서버의 `/b/`에서 제공하는 독립 Vite/React 앱입니다. 같은 쿠키와 `/api/*` 데이터를 사용하며 A의 `app.js` 또는 `styles.css`를 로딩하지 않습니다.

현재 B에서 동작하는 화면: 리뷰(코멘트·검토 완료·월간 Output 내보내기), 내 회고 작성, 팀 현황, 담당 고객사, 일정 관리, 대체휴가, 조직 관리, 내 정보, AWS 월간 What's New입니다. What’s New는 PDF 분석, JSON 가져오기·저장, sandbox 미리보기, PDF/ZIP 요청을 기존 API로 처리합니다. 전체 기능 동등성과 사용성 검증이 끝나기 전까지 운영 비교용으로 공개하지 마세요.

```sh
npm ci
npm run build
```

빌드 산출물은 `../public/b/`에 생기며 Git에서 제외됩니다. 루트 `npm start`로 동일 Express 서버에서 확인합니다. 루트 `npm run test:e2e`가 B 브라우저 테스트도 실행합니다. 운영 환경에서는 기본적으로 B가 비활성화됩니다. 명시적으로 사용할 때만 `DESIGN_B_ENABLED=true`를 설정합니다. B가 비활성화되거나 빌드 산출물이 없으면 `/b/`는 A로 복귀합니다.

shadcn/ui는 `radix-nova`, Tailwind v4, Lucide 구성이며 `components.json`에 고정되어 있습니다. 컴포넌트 추가는 이 디렉터리에서 `npx shadcn@latest`로 진행합니다.
