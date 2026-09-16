"""LLM 기반 1차 파싱 (Bedrock Converse tool use, 비동기 병렬 처리).

PDF에서 추출한 텍스트를 받아 영업용·고객용·대본용 3가지 구조화 데이터를 동시에 뽑는다.
출력 형식은 프롬프트가 아니라 tool use 스키마로 API 레벨에서 강제하므로,
모델이 JSON 문자열을 어떻게 감싸든 상관없이 항상 파싱된 dict를 받는다.

환경변수:
    BEDROCK_API_KEY  (AWS Bedrock API Key. 없으면 기본 자격증명 체인 사용)
    AWS_REGION       (기본: us-east-1. API Key는 발급 리전과 일치해야 한다)
"""

from __future__ import annotations

import asyncio
import datetime
import json
import logging
import os
from typing import Any, AsyncIterator

import boto3
from botocore.config import Config

from . import evidence, ordering
from .prompts import (
    PROMPT_CUSTOMER,
    PROMPT_SALES,
    PROMPT_SCRIPT,
    TOOL_CUSTOMER,
    TOOL_SALES,
    TOOL_SCRIPT,
)

logger = logging.getLogger("aws_report_studio")

DEFAULT_MODEL_ID = "global.anthropic.claude-sonnet-5"
_DEFAULT_REGION = "us-east-1"
_READ_TIMEOUT = 240
_CONNECT_TIMEOUT = 60

# 모델별 최대 출력 토큰. tool use 결과도 출력 토큰을 소비한다.
_MAX_TOKENS_BY_MODEL = {"sonnet-5": 128000, "opus-4-8": 128000, "haiku-4-5": 64000}
_FALLBACK_MAX_TOKENS = 8192

_USER_INSTRUCTION = (
    "Analyze the AWS service-change document below and submit the result by calling the "
    "provided tool. Follow every rule in the system prompt.\n\n[SOURCE DOCUMENT]\n"
)

_STEP_LABELS = {"sales": "영업용 리포트", "customer": "고객용 리포트", "script": "대본 초안"}


def available() -> bool:
    """LLM 호출이 가능한지 여부.

    API Key 또는 기본 자격증명 체인(IAM Role 등) 중 하나만 있으면 동작한다.
    """
    return True


def _build_client() -> Any:
    """Bedrock 런타임 클라이언트를 만든다.

    BEDROCK_API_KEY가 있으면 botocore가 bedrock-runtime의 httpBearerAuth 스킴을
    네이티브로 적용하도록 AWS_BEARER_TOKEN_BEDROCK 에 넘긴다.
    """
    api_key = os.getenv("BEDROCK_API_KEY")
    region = os.getenv("AWS_REGION", _DEFAULT_REGION)

    if api_key:
        import botocore
        config = Config(
            signature_version=botocore.UNSIGNED,
            read_timeout=_READ_TIMEOUT,
            connect_timeout=_CONNECT_TIMEOUT
        )
        client = boto3.client("bedrock-runtime", region_name=region, config=config)

        def add_api_key_header(request, **kwargs):
            request.headers['Authorization'] = f'Bearer {api_key}'

        client.meta.events.register('before-send.bedrock-runtime.Converse', add_api_key_header)
        return client
    else:
        config = Config(read_timeout=_READ_TIMEOUT, connect_timeout=_CONNECT_TIMEOUT, retries={'max_attempts': 0})
        return boto3.client("bedrock-runtime", region_name=region, config=config)


def _max_tokens_for(model_id: str) -> int:
    """모델 ID에 맞는 최대 출력 토큰 수를 고른다."""
    for marker, limit in _MAX_TOKENS_BY_MODEL.items():
        if marker in model_id:
            return limit
    return _FALLBACK_MAX_TOKENS


def _try_json(raw: str) -> Any:
    """JSON 문자열을 파싱한다. 실패하면 None."""
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        return None


def _normalize_tool_input(payload: Any, schema: dict, tool_name: str) -> dict:
    """tool use 응답을 스키마 모양으로 되돌린다.

    Bedrock은 모델이 낸 tool input을 선언한 스키마에 맞춰 검증해주지 않는다.
    실제로 모델이 페이로드 전체를 JSON 문자열로 만들어 필드 하나에 밀어넣는 경우가
    관측되었으므로(배열 자리에 문자열이 그대로 통과), 그 형태를 복구한다.

    Args:
        payload: 모델이 낸 tool input 원본.
        schema: toolSpec의 inputSchema.json.
        tool_name: 오류 메시지에 쓸 도구 이름.

    Returns:
        필수 키를 갖추고 배열 필드가 실제 배열인 dict.

    Raises:
        RuntimeError: 복구 후에도 모양이 스키마와 어긋나는 경우.
    """
    expected_keys = set(schema.get("required", []))
    # 페이로드 전체가 문자열로 중첩된 경우를 먼저 편다.
    if isinstance(payload, str):
        payload = _try_json(payload) or payload
    elif isinstance(payload, dict):
        for key, value in payload.items():
            if not isinstance(value, str):
                continue
            parsed = _try_json(value)
            if isinstance(parsed, dict) and expected_keys & parsed.keys():
                logger.warning(
                    "%s: 응답이 '%s' 필드에 문자열로 중첩되어 있어 복구했습니다", tool_name, key
                )
                payload = parsed
                break

    if not isinstance(payload, dict):
        raise RuntimeError(
            f"{tool_name}: 응답이 객체가 아닙니다 (type={type(payload).__name__})"
        )

    # 개별 필드만 문자열로 직렬화된 경우도 되돌린다.
    normalized = dict(payload)
    for key, value in payload.items():
        if isinstance(value, str):
            parsed = _try_json(value)
            if isinstance(parsed, list):
                logger.warning("%s: '%s' 필드가 문자열이라 배열로 복구했습니다", tool_name, key)
                normalized[key] = parsed

    missing = expected_keys - normalized.keys()
    if missing:
        raise RuntimeError(f"{tool_name}: 응답에 필수 키가 없습니다 {sorted(missing)}")

    # 배열로 선언한 필드가 실제로 배열인지 확인한다. 여기서 조용히 넘어가면
    # 빈 리포트가 정상처럼 렌더링된다.
    for key, prop in schema.get("properties", {}).items():
        if prop.get("type") != "array" or key not in normalized:
            continue
        if not isinstance(normalized[key], list):
            raise RuntimeError(
                f"{tool_name}: '{key}'가 배열이 아닙니다 "
                f"(type={type(normalized[key]).__name__})"
            )

    return normalized


def _call_bedrock_sync(
    text: str, system_prompt: str, tool_spec: dict, model_id: str
) -> dict:
    """Bedrock Converse를 호출해 tool use 결과(dict)를 돌려준다.

    Args:
        text: PDF에서 추출한 원문 전체.
        system_prompt: 용도별 시스템 프롬프트(영어).
        tool_spec: 출력 스키마를 강제할 toolSpec.
        model_id: Bedrock 모델 ID 또는 추론 프로파일.

    Returns:
        toolSpec 스키마를 따르는 파싱된 dict.

    Raises:
        RuntimeError: API 호출이 실패했거나 모델이 도구를 호출하지 않은 경우.
    """
    client = _build_client()
    tool_name = tool_spec["name"]

    try:
        resp = client.converse(
            modelId=model_id,
            system=[{"text": system_prompt}],
            messages=[{"role": "user", "content": [{"text": _USER_INSTRUCTION + text}]}],
            inferenceConfig={"maxTokens": _max_tokens_for(model_id)},
            toolConfig={
                "tools": [{"toolSpec": tool_spec}],
                "toolChoice": {"tool": {"name": tool_name}},
            },
        )
    except Exception as e:
        raise RuntimeError(f"Bedrock 호출 실패({tool_name}): {e}") from e

    for block in resp["output"]["message"]["content"]:
        if "toolUse" in block:
            schema = tool_spec["inputSchema"]["json"]
            return _normalize_tool_input(block["toolUse"]["input"], schema, tool_name)

    raise RuntimeError(
        f"모델이 {tool_name} 도구를 호출하지 않았습니다 (stopReason={resp.get('stopReason')})"
    )


def _verify(results: dict, source_text: str) -> dict:
    """추출 항목의 근거를 원문과 대조하고 진단 정보를 만든다."""
    sales_items = results["sales"].get("items", [])
    eol_items = results["customer"].get("eol_eos", [])
    new_items = results["customer"].get("whats_new", [])

    unverified = {
        "sales": evidence.check_quotes(sales_items, source_text, name_field="title"),
        "eol_eos": evidence.check_quotes(eol_items, source_text, name_field="service"),
        "whats_new": evidence.check_quotes(new_items, source_text, name_field="title"),
    }

    evidence.summarize("영업용", unverified["sales"], len(sales_items))
    evidence.summarize("고객용 EOL/EOS", unverified["eol_eos"], len(eol_items))
    evidence.summarize("고객용 신규", unverified["whats_new"], len(new_items))

    return {
        "unverified": unverified,
        "skipped": {
            "sales": results["sales"].get("skipped", []),
            "customer": results["customer"].get("skipped", []),
        },
    }


def _assemble(results: dict, source_text: str) -> dict:
    """세 호출 결과를 최종 산출물 구조로 합친다(정렬·검증 포함)."""
    customer = results["customer"]
    sales = results["sales"]
    diagnostics = _verify(results, source_text)

    return {
        "meta": {
            "title": "AWS 서비스 변경사항 안내",
            "written": datetime.date.today().strftime("%Y.%m"),
            "customer_intro": customer.get("intro", ""),
            "sales_intro": sales.get("intro", ""),
        },
        "sales": ordering.order_whats_new(sales.get("items", [])),
        "customer": {
            "eol_eos": ordering.order_eol_eos(customer.get("eol_eos", [])),
            "whats_new": ordering.order_whats_new(customer.get("whats_new", [])),
        },
        "script": {
            "outline": results["script"].get("outline", ""),
            "speech": results["script"].get("speech", ""),
        },
        "diagnostics": diagnostics,
    }


async def parse_with_llm_stream(
    text: str, model_id: str = DEFAULT_MODEL_ID
) -> AsyncIterator[dict]:
    import calendar
    today = datetime.date.today()
    exec_month_str = today.replace(day=1).strftime("%Y.%m.%d")

    end_m = today.month + 3
    end_y = today.year
    if end_m > 12:
        end_m -= 12
        end_y += 1
    last_day = calendar.monthrange(end_y, end_m)[1]
    window_end_str = f"{end_y}.{end_m:02d}.{last_day:02d}"

    # Format customer prompt safely
    formatted_customer = PROMPT_CUSTOMER.replace("{exec_month}", exec_month_str).replace("{window_end}", window_end_str)

    """3가지 프롬프트를 병렬 실행하고, 완료될 때마다 진행 상태를 yield 한다.

    Args:
        text: PDF에서 추출한 원문 전체.
        model_id: Bedrock 모델 ID 또는 추론 프로파일.

    Yields:
        {"type": "progress", ...} 진행 이벤트에 이어 {"type": "result", "data": ...} 최종 결과.
    """
    specs = {
        "sales": (PROMPT_SALES, TOOL_SALES),
        "customer": (formatted_customer, TOOL_CUSTOMER),
        "script": (PROMPT_SCRIPT, TOOL_SCRIPT),
    }

    async def run(name: str) -> tuple[str, dict]:
        system_prompt, tool_spec = specs[name]
        result = await asyncio.to_thread(
            _call_bedrock_sync, text, system_prompt, tool_spec, model_id
        )
        return name, result

    tasks = [asyncio.create_task(run(name)) for name in specs]
    results: dict[str, dict] = {}
    total = len(tasks)

    try:
        pending = set(tasks)
        while pending:
            done, pending = await asyncio.wait(pending, return_when=asyncio.FIRST_COMPLETED, timeout=15.0)

            if not done:
                # 15초 타임아웃 방지용 Keep-Alive 핑
                yield {
                    "type": "progress",
                    "completed": len(results),
                    "total": total,
                    "name": "keep_alive",
                    "label": "keep_alive",
                }
                continue

            for task in done:
                name, result = task.result()
                results[name] = result
                yield {
                    "type": "progress",
                    "completed": len(results),
                    "total": total,
                    "name": name,
                    "label": _STEP_LABELS.get(name, name),
                }
    except Exception:
        # 하나가 실패하면 남은 호출을 붙잡아두지 않고 정리한 뒤 예외를 올린다.
        for task in tasks:
            task.cancel()
        raise

    yield {"type": "result", "data": _assemble(results, text)}
