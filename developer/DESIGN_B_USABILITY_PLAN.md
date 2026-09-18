# 디자인 B 사용성·상태 체계 개선 계획

작성: 2026-09-18  
상태: 1차 구현 중. 이 문서의 후속 단계는 계속 유효하다.

## 1차 구현 기록

- B를 `/`의 기본 화면으로 정규화하고, A는 `/?design=a`에 보존했다. `DESIGN_B_ENABLED=false` 롤백도 유지한다.
- A/B 전환 UI와 과거 `msp-design` 선호에 따른 자동 복귀를 제거했다. Slack 로그인 후 B 목적지는 안전한 내부 경로만 복원한다.
- 버튼·입력의 hover, pressed, keyboard focus, selected, disabled 상태에 공통 token을 적용했다. 승인과 반려·삭제, 완료와 대기·반려 badge의 의미를 분리했다.
- 회고 작성, 리뷰 목록·필터, 테마, 월간 리포트 탭에 선택 상태를 명시했다.
- 서버·브라우저 회귀 테스트에 기본 B·레거시 A·롤백·상태 표현 검증을 반영했다.

다음 작업은 중앙 AlertDialog, 필드별 오류·도움말, 표·목록의 클릭 범위와 키보드 동선 정리, 현업 사용성 검증이다.

## 1. 결정

디자인 B를 서비스의 기본 화면으로 정한다. 기존 A 화면의 코드와 데이터 접근 경로는 유지하되, 일반 사용자가 A를 선택하거나 A/B를 비교하는 흐름은 제거한다.

이 작업의 목적은 화면을 더 화려하게 만드는 일이 아니다. 사용자가 아래를 생각하지 않도록 만드는 일이다.

- 이 요소를 눌러도 되는가?
- 눌렀을 때 무엇이 일어나는가?
- 지금 선택된 것은 무엇인가?
- 저장·삭제·승인 중 어느 상태인가?

현재 B는 인디고 계열의 primary, neutral outline, destructive variant를 갖고 있지만, 많은 행동이 같은 neutral hover로 반응한다. 행동의 중요도와 위험도보다 “마우스를 올렸음”만 전달해, 특히 촘촘한 표·폼·목록에서 클릭 가능 여부가 약하게 느껴질 수 있다.

## 2. 조사에서 가져올 원칙

| 근거 | B에 적용할 판단 |
| --- | --- |
| USWDS는 가장 중요한 행동 하나를 눈에 띄게 만들고, 같은 화면에 버튼을 과도하게 두지 말며, 동사를 앞에 둔 짧은 버튼명을 권장한다. | 한 작업 영역에는 primary 행동을 하나만 둔다. 나머지는 outline 또는 텍스트 행동으로 내린다. `저장`, `신청`, `승인`, `삭제`처럼 결과가 보이는 동사를 쓴다. |
| IBM Carbon은 primary·secondary·danger 버튼에 hover·active·focus·disabled를 각각 정의한다. | variant만 정하지 않고 모든 공용 컨트롤에 상태 표를 만든다. 같은 색의 hover를 일괄 적용하지 않는다. |
| W3C는 hover가 보조 피드백일 수는 있어도, 키보드 focus와 선택 상태를 대신할 수 없다고 설명한다. | hover, focus, selected를 서로 다른 시각 언어로 설계한다. 마우스가 없는 환경도 같은 행동을 이해할 수 있어야 한다. |
| W3C WCAG 2.2는 키보드 focus 표시가 충분한 크기와 3:1 이상의 변화 대비를 가져야 한다고 설명한다. | 라이트·다크 테마 모두에서 2px 이상의 focus ring과 3:1 이상 대비를 검증한다. |

참고: [USWDS Button](https://designsystem.digital.gov/components/button/), [IBM Carbon Button states](https://v10.carbondesignsystem.com/components/button/style/), [W3C Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast), [W3C Focus Appearance](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance), [W3C strong focus indicator technique](https://www.w3.org/WAI/WCAG21/Techniques/css/C41).

## 3. B의 상호작용 언어

### 3.1 색의 역할

색상 수를 늘리지 않는다. 인디고는 **주요 행동·현재 선택·키보드 focus**에만 사용한다. 초록·호박·빨강은 행동 자체의 장식이 아니라 서버가 확인한 결과 또는 실제 위험을 전달할 때만 쓴다.

| 의미 | 언제 쓰는가 | 함께 반드시 보여 줄 것 |
| --- | --- | --- |
| Primary / indigo | 이 화면에서 다음으로 진행할 가장 중요한 행동, 현재 선택 | 동사형 버튼명, 아이콘이 필요할 때만 아이콘 |
| Neutral | 보조 행동, 필터, 현재 화면 안의 보기 전환 | 테두리 또는 표면 차이, hover 시 배경 변화 |
| Success | 저장·제출·승인이 실제로 성공한 뒤 | `저장했습니다` 같은 문장과 check 아이콘 또는 상태 badge |
| Warning | 계속 진행 전 확인해야 할 충돌, 미저장 내용, 잔여 시간 부족 | 무엇이 영향 받는지와 선택지 |
| Destructive | 삭제, 취소, 되돌릴 수 없는 종료 | 위험 행동 영역, 삭제 아이콘, 확인 모달 |

색만으로 상태를 전달하지 않는다. 텍스트, 아이콘, 위치, border 또는 badge를 항상 함께 쓴다.

### 3.2 버튼 상태 표

| 상태 | Primary | Neutral / outline | Destructive |
| --- | --- | --- | --- |
| 기본 | 채워진 indigo, 흰 글자 | 명확한 border와 card 배경 | red tint가 아닌 명확한 위험 문맥 안의 red border/글자 |
| hover | 같은 hue에서 밝기·명도만 한 단계 변화, 120–160ms | 표면이 muted로 채워지고 border가 한 단계 선명해짐 | red 표면이 한 단계 진해짐 |
| pressed | 1px 아래 이동 또는 inset 변화와 더 진한 표면 | 배경·border 동시 변화 | 배경·border 동시 변화 |
| keyboard focus | hover와 구별되는 2px ring, outline offset | 동일한 ring | 동일한 ring, 위험 색을 focus 색으로 쓰지 않음 |
| selected / current | 채움 + leading bar 또는 check / `aria-current` | 선택 색을 섞어 쓰지 않음 | 해당 없음 |
| busy | 폭을 유지하고 spinner와 `저장 중…` 표시, 중복 클릭 잠금 | 동일 | 동일 |
| disabled | 대비를 낮추되 버튼 형태와 이유를 보존, cursor 차단 | 동일 | 동일 |

hover는 “마우스가 여기 있다”는 보조 신호다. 선택됨·오류·포커스와 같은 색이나 같은 효과를 공유하지 않는다.

### 3.3 입력과 작성 화면

입력칸은 현재보다 한 단계 더 명확한 경계를 갖고, label·도움말·검증 결과가 한 묶음으로 읽히게 한다.

- 기본: card와 구분되는 border와 배경. placeholder는 값처럼 보이지 않는 muted text.
- hover: neutral border만 선명하게 하며 배경을 과도하게 바꾸지 않는다.
- focus: label, caret, 2px focus ring이 같은 입력을 가리킨다. hover 색과 구별한다.
- 입력 완료: 값이 있다는 사실만으로 초록 처리하지 않는다. 저장 성공은 화면 상단 상태 또는 버튼 근처 문장으로 알린다.
- 오류: 빨간 border만 쓰지 않는다. 해당 필드 아래에 원인과 해결 방법을 적고 `aria-describedby`로 연결한다.
- 필수·선택, 글자 수 제한, 티켓 최대 1,024건, 파일 수·용량은 입력 전에 바로 보인다.
- 긴 회고·메모는 focus 시 border를 강조하되 레이아웃이 움직이지 않게 한다.

### 3.4 클릭 가능한 정보와 읽기 전용 정보

표·카드·일정표에는 클릭 가능한 행과 읽기 전용 텍스트가 섞여 있다. 이 구분을 먼저 만든다.

- 열리는 행: hover 배경 + pointer cursor + 제목 또는 끝 아이콘 + 키보드 focus. 행 전체를 눌러도 되는 경우에만 적용한다.
- 행 안의 개별 버튼: 행 hover와 별도로 button surface를 가진다. 행 클릭과 중첩시키지 않는다.
- 읽기 전용 badge·수치: hover 반응을 주지 않는다.
- 선택된 행: hover와 다른 persistent surface, left indicator 또는 check를 사용한다.
- 링크: 밑줄 또는 명확한 hover 밑줄로 버튼과 다른 목적지 이동임을 나타낸다.

### 3.5 위험 행동과 확인

삭제·승인 취소·일정 덮어쓰기·미저장 변경 이탈은 브라우저 기본 `confirm`을 계속 사용하지 않는다. 중앙 AlertDialog에서 다음을 분명히 한다.

1. 무엇을 바꾸거나 삭제하는가
2. 되돌릴 수 있는가
3. 계속하기와 취소 중 어느 쪽이 안전한가

기본 focus는 안전한 `취소`에 두고, 위험 행동은 맨 오른쪽에 destructive variant로 배치한다. 상태만 확인하는 동작에는 확인창을 추가하지 않는다.

## 4. B를 기본으로 전환하는 범위

### 사용자에게 보이는 동작

- `/`는 B를 연다. `/b/`는 B의 호환 alias로 유지한다.
- 메뉴와 설정에서 `기존 디자인 A` / `새 디자인 B` 전환 버튼을 제거한다.
- 기존 A는 `/?design=a`로만 접근 가능하게 남긴다. 일반 UI, 문서 링크, 로그인 복귀는 A를 가리키지 않는다.
- `DESIGN_B_ENABLED=false`는 비상 롤백 수단으로 유지한다. 이때 `/`는 A를 제공하고 B 경로는 A로 복귀한다.
- 기존 A 페이지, 정적 자산, API, DB schema, 업무 규칙은 삭제하거나 변경하지 않는다.

### 서버 라우팅 원칙

| 요청 | B 사용 가능 | B 비활성 롤백 |
| --- | --- | --- |
| `/` | B로 정규화 | A 제공 |
| `/b/` | B 제공 | A로 정규화 |
| `/?design=a` | A 제공, legacy 표시 없음 | A 제공 |
| `/?design=b` | B로 정규화 | A로 정규화 |
| 기존 A deep link | hash·week을 유지한 B로 정규화, 단 `design=a`은 예외 | A에서 유지 |

Slack 로그인 전 저장하는 return path도 위 규칙으로 정규화한다. 로컬 저장소에 남은 과거 `msp-design=a` 값이 B 기본 진입을 A로 되돌리지 않도록 migration 처리한다.

## 5. 실행 단계

### 단계 0 — 기준 기록과 행동 목록화

대상 파일을 바꾸기 전에 B의 모든 버튼·입력·행 클릭·링크를 아래 다섯 분류로 표로 만든다.

1. primary action
2. secondary action
3. navigation / selection
4. feedback / status
5. destructive action

화면별로 1366×768, 390×844, 라이트·다크의 기준 스크린샷을 남긴다. 특히 리뷰, 내 회고 작성, 고객사, 일정 관리, 대체휴가, 조직 관리, AWS 월간 What's New를 확인한다.

완료 기준: 각 인터랙션이 한 분류에만 속하고, 한 화면의 primary action이 하나를 넘는 경우 이유가 기록되어 있다.

### 단계 1 — 공용 토큰과 컴포넌트

`frontend-b/src/index.css`에 hue가 아닌 의미 기반 token을 추가한다. 예: `--action-primary-*`, `--surface-hover`, `--border-hover`, `--focus-ring`, `--status-success-*`, `--status-warning-*`, `--status-danger-*`.

`frontend-b/src/components/ui/button.tsx`, input, textarea, select, field, alert 계열에 기본·hover·pressed·focus·disabled·busy 규칙을 적용한다. theme별 대비는 자동 추정하지 않고 실제 색상 조합을 검증한다.

완료 기준: 같은 variant가 모든 페이지에서 같은 상태 변화를 보이고, 아이콘 전용 버튼도 accessible name과 focus ring을 가진다.

### 단계 2 — 작성·저장 흐름

`ReviewEdit`, `Customers`, `Schedule`, `CompLeave`, `Organization`, `MonthlyDigest`, 프로필 모달의 필드를 순서대로 적용한다.

- 저장·제출·신청은 요청 중 상태와 성공·실패 메시지를 명확히 한다.
- 서버 오류는 해당 필드 또는 폼 상단에서 다음 행동을 알린다.
- 실패 후 입력값을 보존한다.
- 미저장 변경, 삭제, 승인 취소, 기간 덮어쓰기는 중앙 AlertDialog로 전환한다.

완료 기준: 사용자는 색만 보지 않고도 현재 입력 가능·저장 중·성공·오류·위험 행동을 설명할 수 있다.

### 단계 3 — 정보 밀도 높은 화면

`Reviews`, `Schedule`, `Customers`, `Organization`의 목록과 표에 클릭 가능성·선택 상태·읽기 전용 상태를 적용한다.

- 일정표 날짜 셀은 날짜·이름·상태를 keyboard focus에서 읽을 수 있어야 한다.
- 리뷰 발표자, 고객사 선택, 조직 구성원 선택은 selected와 hover가 구별되어야 한다.
- 승인 대기·완료·반려는 badge 텍스트와 icon으로 함께 표시한다.
- row action은 작아도 44px 터치 목표 또는 충분한 간격을 유지한다.

완료 기준: 마우스를 사용하지 않고 Tab/Enter/Escape만으로 각 화면의 주요 행동을 끝낼 수 있다.

### 단계 4 — B 기본 전환

`src/server.mjs`, `frontend-b/src/App.tsx`, 기존 A 진입 코드, `.env.example`, README, E2E를 수정한다.

- B canonical URL, A legacy URL, feature flag rollback을 구현한다.
- A/B 스위치 UI와 비교 전용 localStorage 처리만 제거한다.
- A의 코드·정적 자산·기존 테스트는 남긴다.

완료 기준: B 활성 운영 환경에서 `/`, `/b/`, Slack 재로그인 복귀, 오래된 deep link가 B로 안전하게 도착하고, flag를 끄면 A로 즉시 롤백된다.

### 단계 5 — 현업 검증과 정리

대표 사용자 5명 이상에게 같은 업무를 시킨다.

1. 이번 주 회고를 작성해 임시 저장한다.
2. 동료 회고에 코멘트를 남긴다.
3. 고객사 이력을 추가한다.
4. 일정 하나를 수정한다.
5. 대체휴가 신청 화면까지 이동한다.

각 과제 뒤에 “누를 수 있는 요소를 찾는 데 망설였는가”, “저장 결과를 이해했는가”, “위험 행동을 알아챘는가”만 짧게 묻는다. 관찰 결과가 있는 곳만 후속 조정한다.

## 6. 검증 항목

- 라이트·다크 모두에서 button, input border, focus ring, selected, disabled, alert의 대비를 측정한다.
- 모든 인터랙티브 요소의 mouse hover, keyboard focus, pressed, busy, disabled 상태를 스크린샷으로 비교한다.
- `Tab` 순서, Enter/Space 실행, Escape로 모달 닫기, 모달 닫은 뒤 focus 복귀를 E2E로 검증한다.
- 버튼은 실제 `<button>`, 페이지 이동은 `<a>`를 사용한다. icon-only button에는 `aria-label`을 둔다.
- 기존 B E2E의 회고·일정·대체휴가·조직·월간 리포트 흐름을 유지하고, B 기본 URL·A legacy URL·flag rollback 테스트를 추가한다.
- 390×844 / 768×1024 / 1366×768, 85·110·130% 글자 크기, 긴 이름·메모·빈 상태에서 가로 넘침이 없는지 확인한다.
- 실제 업무 데이터와 권한·승인·잔액·파일 업로드 규칙은 변경하지 않는다.

## 7. 예상 변경 파일

| 범위 | 파일 |
| --- | --- |
| 상태 token·전역 상태 | `frontend-b/src/index.css` |
| 공용 버튼·입력·알림 | `frontend-b/src/components/ui/button.tsx`, `input.tsx`, `textarea.tsx`, `select.tsx`, `field.tsx`, `alert.tsx` |
| 화면별 적용 | `frontend-b/src/App.tsx`, `frontend-b/src/features/*.tsx` |
| B 기본 진입·legacy | `src/server.mjs`, 기존 A 진입 스크립트 |
| 설정·문서 | `.env.example`, `README.md`, `frontend-b/README.md` |
| 회귀 검증 | `e2e/design-b.test.mjs`, `e2e/site.test.mjs`, 관련 서버 테스트 |

## 8. 이번 단계에서 하지 않을 일

- 새 브랜드 색상이나 그라데이션 도입
- 업무 규칙, 권한, DB schema, API 계약 변경
- 자동 저장을 추가해 저장 상태를 모호하게 만드는 일
- A 코드·테스트·정적 자산 삭제
- B 활성화만을 위해 CSP 또는 Slack 인증 검증을 약화하는 일
