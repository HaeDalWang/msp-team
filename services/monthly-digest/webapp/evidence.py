"""LLM이 낸 근거(source_quote)를 원문과 대조한다.

모델은 각 항목마다 원문에서 그대로 복사한 문장을 `source_quote`로 함께 낸다.
그 문장이 실제 원문에 없다면 그 항목은 지어낸 것이므로, 사람이 검토하기 전에
어떤 항목이 의심스러운지 알려준다.

여기서는 예외를 던지지 않는다. 판단은 사람이 하고, 이 모듈은 근거만 제공한다.
"""

from __future__ import annotations

import logging

logger = logging.getLogger("aws_report_studio")


def _normalize(text: str) -> str:
    """공백 차이를 무시하고 비교하기 위한 정규화.

    PDF 텍스트 추출은 줄바꿈·연속 공백을 원문과 다르게 만들기 때문에,
    공백만 다른 경우를 환각으로 오판하지 않도록 한다.
    """
    return " ".join(text.split())


def check_quotes(items: list[dict], source_text: str, *, name_field: str) -> list[dict]:
    """`source_quote`가 원문에 실제로 존재하는지 검사한다.

    Args:
        items: 검사할 항목 리스트. 각 항목은 `source_quote`를 가진다고 가정한다.
        source_text: PDF에서 추출한 원문 전체.
        name_field: 항목 이름이 담긴 키('title' 또는 'service').

    Returns:
        대조에 실패한 항목들의 [{"name": ..., "quote": ...}] 리스트.
        전부 통과하면 빈 리스트.
    """
    if not isinstance(items, list):
        return []

    haystack = _normalize(source_text)
    unverified: list[dict] = []

    for item in items:
        if not isinstance(item, dict):
            continue

        quote = _normalize(str(item.get("source_quote", "")))
        if quote and quote in haystack:
            continue

        unverified.append(
            {"name": str(item.get(name_field, "(이름 없음)")), "quote": item.get("source_quote", "")}
        )

    return unverified


def summarize(label: str, unverified: list[dict], total: int) -> None:
    """대조 결과를 로그로 남긴다."""
    if not unverified:
        logger.info("[%s] 근거 대조 통과: %d개 항목 전부 원문에서 확인됨", label, total)
        return

    logger.warning(
        "[%s] 근거 대조 실패 %d/%d건 — 원문에서 찾을 수 없는 항목: %s",
        label,
        len(unverified),
        total,
        ", ".join(entry["name"] for entry in unverified),
    )
