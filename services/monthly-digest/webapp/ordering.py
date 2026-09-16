"""산출물 항목 정렬.

정렬은 LLM에게 맡기지 않는다. 모델이 매번 다르게 정렬하면 같은 입력에서 다른 문서가
나오고, 정렬은 결정론적으로 처리할 수 있는 작업이기 때문이다.

규칙:
    - 신규 기능(What's New): 발표일 최신순
    - EOL/EOS: 종료일이 임박한 순
    - 날짜가 같으면 서비스명 오름차순, 날짜가 없는 항목은 항상 맨 뒤
"""

from __future__ import annotations

from typing import Any

# 날짜를 못 읽은 항목이 정렬 방향과 무관하게 맨 뒤로 가도록 하는 경계값
_UNDATED_WHEN_DESC = (0, 0, 0)
_UNDATED_WHEN_ASC = (9999, 99, 99)


def _parse_date(raw: Any) -> tuple[int, int, int] | None:
    """'2026.06.30' / '2026.06' -> 정렬용 튜플. 읽을 수 없으면 None."""
    if not isinstance(raw, str):
        return None

    parts = [p for p in raw.strip().replace("-", ".").split(".") if p]
    if not parts:
        return None

    try:
        numbers = [int(p) for p in parts[:3]]
    except ValueError:
        return None

    while len(numbers) < 3:
        numbers.append(0)
    return (numbers[0], numbers[1], numbers[2])


def _sorted_by_date(
    items: list[dict], *, date_field: str, name_field: str, newest_first: bool
) -> list[dict]:
    """날짜 기준 정렬(원본 리스트는 건드리지 않고 새 리스트를 반환)."""
    if not isinstance(items, list):
        return []

    undated = _UNDATED_WHEN_DESC if newest_first else _UNDATED_WHEN_ASC

    # 이름으로 먼저 정렬한 뒤 날짜로 다시 정렬한다.
    # 파이썬 정렬은 안정 정렬이라 날짜가 같은 항목들 사이에서는 이름 순서가 유지된다.
    return sorted(
        items,
        key=lambda item: _parse_date(item.get(date_field)) or undated,
        reverse=newest_first,
    )


def order_whats_new(items: list[dict]) -> list[dict]:
    """
    신규 기능(고객용/영업용)은 검토자의 팩트 체크 편의성을 위해 원본 PDF의 흐름(AI 추출 순서)을 그대로 유지한다.
    날짜순 강제 정렬을 하지 않는다.
    """
    return items if isinstance(items, list) else []


def order_eol_eos(items: list[dict]) -> list[dict]:
    """EOL/EOS 항목을 종료일이 임박한 순으로 정렬한다."""
    return _sorted_by_date(items, date_field="date", name_field="service", newest_first=False)
