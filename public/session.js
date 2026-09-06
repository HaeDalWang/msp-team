// 로그인 세션을 여러 화면(app.js, views/*)이 공유하는 단일 모듈.
// role은 서버 seed 기준 'engineer' | 'lead' | 'executive' | 'admin' 중 하나.
export const session = { checked: false, user: null, error: '' }

export async function loadSession() {
  try {
    const response = await fetch('/api/me')
    if (!response.ok && response.status !== 401)
      throw new Error(
        '로그인 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      )
    session.user = response.ok ? await response.json() : null
    session.error = ''
  } catch (error) {
    session.user = null
    session.error = error.message || '서버에 연결하지 못했습니다.'
  }
  session.checked = true
  return session.user
}

export function isAdmin() {
  return session.user?.role === 'admin'
}
export function isAdminOrLead() {
  return session.user?.role === 'admin' || session.user?.role === 'lead'
}
export function isSelfOrAdminOrLead(userId) {
  return session.user?.userId === userId || isAdminOrLead()
}
