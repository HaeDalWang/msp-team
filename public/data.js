// 원본 prototype(src/data.ts)의 mock 데이터를 그대로 옮긴 것. 실제 API 연결 전까지 화면 검증용.
export const entries = [
  { name: '이주엽', part: 'Leaf', tickets: [2, 3, 0], status: '제출 완료',
    blocks: [
      { customer: '월간 리뷰', items: [{ text: '케이비캐피탈, 온다엑스, 금호타이어, 에이아이소울, 슈퍼무브 전달 완료' }] },
      { customer: '금호타이어', items: [{ text: '월간 리뷰 세부 내용 보완 요청 대응 중' }] },
    ] },
  { name: '정장훈', part: 'Leaf', tickets: [7, 6, 10], status: '검토 완료',
    blocks: [
      { customer: '한국일보', items: [{ text: 'hkservice 계정 리소스 태깅 요청 및 작업' }, { text: '외부 접속 권장 사항 안내 및 요구사항 확인 중' }] },
      { customer: '파고다', items: [{ text: '신규 CodeDeploy 배포 생성 및 인프라 설정 추가' }, { text: 'Lambda Python 3.14 런타임 전환 진행' }] },
    ],
    actionItems: ['파고다 AI 신규 서비스 도입에 따른 인프라 구성 작업'],
    otherNotes: ['한국일보 CloudFront 비용 최적화와 x86 → arm64 전환 검토'],
    topsProjects: ['고객사 비용 최적화 표준 가이드 최신화 진행'] },
  { name: '김이현', part: 'Leaf', tickets: [0, 0, 0], status: '미작성', blocks: [] },
  { name: '임종현', part: 'Leaf', tickets: [0, 0, 0], status: '미작성', blocks: [] },
  { name: '김범중', part: 'Tiger', tickets: [12, 7, 9], status: '재검토 필요',
    absence: '8월 31일 오후 ~ 9월 4일 휴가 (연차 소진)',
    blocks: [
      { customer: '케이비자산운용', items: [{ text: 'Aurora MySQL 버전 업그레이드 → 9월 2째주 지원 예정' }] },
      { customer: '케이비자산운용_DI', items: [
        { text: '신규 계정(DI-API) 구성 완료, 고객 작업 대기 중' },
        { text: 'DI-API 아키텍처 전달' },
        { text: 'DMS 트러블슈팅' },
        { text: 'LOB가 너무 크면 OOM 발생 / LOB가 작으면 데이터가 잘려서 삽입', sub: true },
        { text: 'LimitedLOB-LobMaxSize, CommitRate, MemoryLimitTotal 커스텀 필요', sub: true },
        { text: 'RDS CloudWatch 알람 구성 지원' },
        { text: 'MFA 강제 정책 안내' },
        { text: 'RDS(MSSQL) 버전 표준 지원 종료일 안내 (2027년, 2030년)' },
      ] },
      { customer: '케이비자산운용_RA', items: [{ text: 'MSP Enterprise → Basic' }, { text: '정리 가능한 리소스 파악하여 안내' }] },
      { customer: '케이비자산운용_홈페이지개발', items: [{ text: 'AWS 계정을 개발사인 솔트룩스로 이관 (영업에서 계약서 작성 중)' }] },
      { customer: '트래블로버', items: [{ text: 'EC2 IAM Role 연결' }] },
      { customer: '이동의즐거움', items: [{ text: '이전 법인 서버와 S3 Endpoint 통신 Timeout → 보안 그룹 허용 안내' }] },
    ],
    goals: ['월간리뷰 발송 완료', 'MSP 고객사 특이사항 정리'],
    actionItems: ['[내부] Terraform Generator — 기능 분류, MSA 정의, Git 구성'],
    otherNotes: ['Dragon Part MSP 고객사 인수인계 및 Rebalancing'],
    topsProjects: ['Terraform Generator MVP 범위와 완료 기준 최신화'] },
  { name: '김성호', part: 'Tiger', tickets: [0, 0, 0], status: '제출 완료',
    blocks: [{ customer: '금성출판사', items: [{ text: '월간리뷰 진행' }] }],
    actionItems: ['[내부] AWS 서비스 변경사항 리포트 제작 자동화 — AWS 환경 Migration'],
    otherNotes: ['팀 계정 확정 후 자동화 환경 이관 예정'],
    topsProjects: ['서비스 변경사항 리포트 자동화 배포 목표 최신화'] },
  { name: '배승도', part: 'Tiger', tickets: [5, 8, 4], status: '제출 완료',
    blocks: [
      { customer: '이동의즐거움', items: [{ text: '기존 피어링 삭제 작업 완료 후 결과 회신' }] },
      { customer: '리파인', items: [{ text: 'Kiro 프로필 계정 간 이전 가이드 및 관련 GitHub 이슈 안내' }] },
      { customer: '이지스엔터프라이즈', items: [{ text: '기존 플랫폼 비용 산정 결과 회신' }] },
    ],
    goals: ['AI Agent 기반 Kubernetes 업그레이드 자동화 스킬 고도화', '근거 기반 티켓 응대 에이전트 체계 구축'],
    actionItems: ['[내부] 근거 기반 티켓 응대 에이전트 체계 자체 테스트'],
    otherNotes: ['이동의 즐거움 기존 코드레포지토리 이관 작업 날짜 협의 중'],
    topsProjects: ['티켓 응대 에이전트의 근거·확실성 평가 기준 최신화'] },
  { name: '서채운', part: 'Tiger', tickets: [1, 4, 2], status: '검토 완료', blocks: [{ customer: '코파스', items: [{ text: '시간대별 스케일링 사용량 분석 및 비용 최적화 안내' }] }] },
  { name: '이용태', part: 'Dragon', tickets: [0, 0, 0], status: '미작성', blocks: [] },
  { name: '송민석', part: 'Dragon', tickets: [0, 0, 0], status: '제출 완료', blocks: [{ customer: 'CloudOps', items: [{ text: 'AWS Support 조회 및 case open 기능 추가' }, { text: 'Cognito 패스키 로그인 전환 작업 진행' }] }] },
  { name: '권하빈', part: 'Dragon', tickets: [3, 0, 0], status: '작성 중', blocks: [{ customer: '컴퍼니 에이', items: [{ text: '유지보수 이벤트로 인한 시스템 재부팅 문의 대응' }] }] },
  { name: '조수현', part: 'Dragon', tickets: [0, 0, 0], status: '미작성', blocks: [] },
  { name: '정지우', part: 'Dragon', tickets: [2, 3, 3], status: '검토 완료', blocks: [{ customer: 'CloudOps', items: [{ text: '이메일 및 알람 수신 구현 작업 진행 중' }] }] },
]

const monthlySummaryEntry = (overrides) => ({
  name: 'MSP 팀 집계', part: 'MSP', tickets: [0, 0, 0], status: '검토 완료', blocks: [], ...overrides,
})

export const monthlyReviewSnapshots = [
  { reviewEnd: '2026-08-10', totalTickets: 48, entries: [monthlySummaryEntry({
    blocks: [
      { customer: '한국일보', items: [{ text: 'CloudFront 비용 최적화 기술 문의 및 x86 → arm64 전환에 따른 서버 재구성 검토' }] },
      { customer: '텍슨', items: [{ text: 'MariaDB 10.5 EOL 대응을 위해 8월 31일 전 업그레이드 방법과 목표 버전 확인' }] },
    ],
    actionItems: ['[내부] Coda Test 진행 (김범중, 서채운)'],
    otherNotes: ['미래에셋자산운용·미래에셋자산운용_AI 퇴점 및 타 MSP 이전'],
    topsProjects: ['Coda Test 검증 범위와 완료 기준 최신화'],
  })] },
  { reviewEnd: '2026-08-17', totalTickets: 50, entries: [monthlySummaryEntry({
    blocks: [
      { customer: '케이비자산운용', items: [{ text: 'DI 신규 계정 구축' }] },
      { customer: '파고다', items: [{ text: 'AI 활용 신규 서비스 도입에 따른 ECS 기반 인프라 구성' }] },
    ],
    actionItems: ['[내부] Terraform Generator (김범중, 서채운) — 기능 분류, MSA 정의, Git 구성 중'],
    otherNotes: ['쓰리알이노베이션 8월부터 MSP Advanced → Basic 변경'],
    topsProjects: ['Terraform Generator MVP 목표와 담당 범위 최신화'],
  })] },
  { reviewEnd: '2026-08-24', totalTickets: 53, entries: [monthlySummaryEntry({
    blocks: [
      { customer: '이동의즐거움', items: [{ text: '기존 코드레포지토리 이관 작업 날짜 협의 중' }] },
      { customer: '페이지원', items: [{ text: 'Datadog POC Agent 및 APM 설정 진행 중' }] },
    ],
    actionItems: ['[내부] AWS 서비스 변경사항 리포트 제작 자동화 (이주엽, 김성호) — 로컬 환경에서 AWS 환경으로 Migration'],
    otherNotes: ['Dragon Part MSP 고객사 인수인계 및 Rebalancing', 'Databricks·Datadog 세미나 담당 지정 및 10월 진행 예정'],
    topsProjects: ['서비스 변경사항 리포트 자동화의 AWS 이관 목표 최신화'],
  })] },
  { reviewEnd: '2026-08-31', totalTickets: 55, entries },
]

export const comments = [
  { author: '팀장', at: '8월 31일 10:42', text: 'DMS LOB 튜닝 값은 다음 주 회고에 최종 파라미터로 남겨주세요. 다른 고객사에도 재사용할 수 있게 정리 부탁합니다.' },
  { author: '김범중', at: '8월 31일 10:47', text: '확인했습니다. 테스트 결과와 함께 정리해두겠습니다.' },
]
