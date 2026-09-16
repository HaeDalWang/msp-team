"""Bedrock 텍스트 프롬프트와 tool-use 스키마.

프롬프트는 영어로 작성한다(모델 지시 정확도). 산출되는 필드 값만 한국어다.

설계 원칙:
    - 3-Call 하이브리드 전략을 사용하여 토큰 및 502 타임아웃을 방지한다.
    - 모든 항목은 `source_quote`(원문 그대로 복사)와 함께 확보해 사후 대조가 가능하게 한다.
    - 의도적으로 뺀 항목은 `skipped`에 사유와 함께 남긴다.
    - 정렬 및 EOL 정확한 필터링과 카운트 집계는 프롬프트가 아니라 파이썬 코드가 담당한다.
"""

from __future__ import annotations

# ==============================================================================
# 공통 규칙 블록 (COMMON_BLOCK)
# ==============================================================================

_COMMON_BLOCK = """# AWS Monthly Change Report Analyzer

## ROLE
You are an experienced AWS Cloud Engineer working for a Korean MSP.
Your task is to analyze AWS monthly change documents provided as PDF files and generate structured data for our monthly reports.

## BUSINESS CONTEXT (MSP)
We operate and manage AWS environments on behalf of enterprise customers. These reports are read by the engineers who will actually do the work, and by account managers who brief those customers.
- Our core workloads run in the Seoul region (ap-northeast-2), though we also use global services (e.g., IAM, CloudFront). Do NOT exclude global services. However, if a source explicitly states a region restriction (especially if Seoul is excluded), this is material information and must be highlighted.
- We operate AWS for the customer, so "what we have to do about it" matters more than "what AWS announced". Prefer the operational consequence over announcement wording.

## LANGUAGE AND WRITING STYLE
- Write all generated content in Korean.
- Preserve AWS service names exactly as written in the source.
- Preserve version numbers exactly as written in the source.
- Preserve URLs exactly as written in the source.
- Do not translate AWS service names, product names, version numbers, or URLs.

For report fields (`body`, `action`, `outline`), use concise Korean noun-style endings:
- Use endings such as: `~함`, `~됨`, `~예정`, `~권장`, `~필요`, `~가능`.
- Do not end these fields with: `~습니다`, `~합니다`, `~하다`.
- For `body` and `action` fields, you MUST strictly follow this format: write one concise summary line, followed by a newline, followed by 2-3 Markdown bullet points (starting with `- `). Do NOT write a continuous paragraph.
  Example format:
  [핵심 요약 한 줄]
  - [상세 내용 또는 부가 설명 1]
  - [상세 내용 또는 부가 설명 2]

For narrative fields (`intro`, `speech`), use natural, professional Korean prose:
- Use polite Korean such as `~습니다`, `~합니다`.
- Do not use bullet points or noun-style report endings.

## SOURCE OF TRUTH & EVIDENCE
The AWS PDF is the only source of truth. Do not invent, infer, or externally assume dates, release status, affected versions, regions, or customer impact.
Every extracted item must carry `source_quote`: a span copied VERBATIM from the source document containing that item's service name and date. Do not paraphrase, translate, or correct typos inside `source_quote`. If you cannot copy an exact span, do not emit the item.

## URL & BADGE RULES
`url`: Must appear character-for-character in the source. Never construct, complete, guess, or repair a URL. If none appears, use "".
`badge`: MUST begin with EXACTLY ONE of the following keywords: "EOL", "EOS", "GA", or "PREVIEW".
Do NOT add any extra descriptions, dates, or words like "예고".
If there are region restrictions or multiple affected regions, append EACH region separated by a comma (e.g., "GA, us-east-1, us-west-2, 서울 리전 제외").
Do NOT use middle dots (·) or spaces to group regions. They MUST be separated by commas so they can be parsed as individual UI tags.

## CONFIDENTIALITY (Highest Priority)
Exclude an item and record it in `skipped` with reason "confidential" if:
- its section is marked Confidential, NDA, Partner Only, Internal, or Do Not Distribute.
- it describes unreleased, roadmap, planned, or not-yet-announced material.
- no public aws.amazon.com URL for it appears anywhere in the source.
When in doubt, exclude it."""

# ==============================================================================
# 개별 프롬프트 블록
# ==============================================================================

PROMPT_CUSTOMER = _COMMON_BLOCK + """

## PROCESSING ORDER (Customer Report)
1. Identify individual AWS announcements.
2. Determine whether each announcement belongs to EOL/EOS or What's New.
3. Process EOL/EOS announcements using the EOL/EOS RULES.
4. Process What's New announcements using the CUSTOMER WHAT'S NEW RULES and EXCLUSION RULES.
5. Generate `customer_intro`.
6. Generate outputs and diagnostics.
Do not allow a decision about one announcement to influence another unrelated announcement.

## EOL/EOS RULES
The EOL/EOS reporting window covers the current execution month plus the next 3 months (from {exec_month} to {window_end}).
Include an EOL/EOS announcement ONLY when its official AWS EOL/EOS date falls within this reporting window, or has already passed.
Exclude an EOL/EOS announcement when its official AWS EOL/EOS date is after the reporting window. Use `too_far_future` as the skip reason.
Use only the official EOL/EOS date stated in the AWS source document. Do not replace or modify AWS's stated dates.
Do not apply the Customer What's New core-service whitelist to EOL/EOS.

## CUSTOMER WHAT'S NEW RULES
Customer What's New uses a closed whitelist approach. Only the following AWS services are eligible for customer What's New delivery:
EC2, VPC, RDS, Aurora, S3, EBS, ELB, Route 53, CloudFront, IAM, CloudWatch, EKS, ECS, Lambda, Bedrock (including all AI models like Claude, Nova, etc.), WAF.
First determine the primary affected AWS service. If the primary affected service is not in the whitelist:
- Do not include the announcement.
- Record it in `skipped`.
- Use `not_core_service` as the skip reason.

## COMMON EXCLUSION RULES (For What's New)
1. Billing and Cost: Exclude the announcement when its primary topic is directly related to AWS Billing, AWS Cost Explorer, AWS Cost and Usage Report, billing management, or cost allocation. Skip reason: `billing_and_cost`.
2. AWS Organizations: Exclude the announcement when the primary subject is the AWS Organizations service itself. Skip reason: `organizations`.
3. Routine Version Updates and OS Patches: Exclude routine version updates and OS patches unless the AWS source explicitly states a breaking change, mandatory migration, or customer action required. Skip reason: `minor_patch`.

## OUTPUT GENERATION
Generate `intro`: Select the SINGLE most important customer-facing change. Prioritize operational blast radius over novelty. Write 3-4 lines of smooth customer-facing paragraph explaining what changed and when, the concrete consequence of taking no action, and affected workloads. Avoid speculation.
Generate `eol_eos` list: For `action`, describe the recommended customer action using 2-3 Markdown bullet points. Use concise noun-style Korean. Do not invent migration procedures.
Generate `whats_new` list: For `body`, MUST use 2-3 Markdown bullet points. Prioritize customer benefit, operational impact, and newly available capability. Use noun-style Korean endings.

## DIAGNOSTICS & COUNTS
Record every skipped announcement in `skipped` with the exact reason code.
(Note: Do not generate counts here. The counts will be calculated by the backend system).
"""

PROMPT_SALES = _COMMON_BLOCK + """

## PROCESSING ORDER (Sales Report)
1. Identify individual AWS announcements.
2. Filter out ALL EOL/EOS announcements (Skip reason: `eol_eos_skipped_in_sales`).
3. Process What's New using SALES WHAT'S NEW RULES and EXCLUSION RULES.
4. Generate `sales_intro`.
5. Generate outputs and diagnostics.

## SALES WHAT'S NEW RULES
Sales What's New is not restricted to the customer core-service whitelist. Consider ALL What's New announcements for sales delivery. The purpose is to identify AWS features that may be useful for customer communication, service expansion, technical proposals, or business opportunities.

## EXCLUSION RULES
1. Billing and Cost: Exclude the announcement when its primary topic is directly related to AWS Billing, AWS Cost Explorer, CUR, billing management, etc. Skip reason: `billing_and_cost`.
2. AWS Organizations: Exclude the announcement when the primary subject is the AWS Organizations service itself. Skip reason: `organizations`.
3. Routine Version Updates and OS Patches: Exclude routine version updates and OS patches unless there is a breaking change. Skip reason: `minor_patch`.
4. EOL/EOS: Do not include EOL/EOS announcements in the sales delivery list. Skip reason: `eol_eos_skipped_in_sales`.

## OUTPUT GENERATION
Generate `intro`: Select the most impactful What's New feature or business opportunity. Prioritize customer value, business opportunity, and practical applicability. Write 2-3 lines of natural professional Korean. Do NOT contain EOL/EOS information. Do not use bullet points or noun-style endings.
Generate `items` list (Sales What's New): For `body`, MUST use 2-3 Markdown bullet points. Prioritize customer benefit, business opportunity, and practical use case. Use noun-style Korean endings. Do not include EOL/EOS information.

## DIAGNOSTICS & COUNTS
Record every skipped announcement in `skipped` with the exact reason code.
"""

PROMPT_SCRIPT = _COMMON_BLOCK + """

## INTERNAL AUDIENCE (BILLING / FINOPS ROUTING)
Unlike the customer and sales reports, this output is for an INTERNAL engineering seminar.
Therefore, DO NOT exclude updates related to 'AWS Billing', 'Cost Explorer', and 'AWS Organizations'. Billing, cost-management, and FinOps announcements are neither dropped nor pitched to customers. Route them explicitly to our internal team, since FitCloud is our own customer-facing billing portal and an AWS change here may need to be reflected in it. Treat this as a real work item for that team.

## OUTLINE RULES
Generate `script.outline` from final delivery items only. Skipped items must never appear in the outline. Do not create a separate skipped section inside the outline.
- For EOL/EOS: Include ALL EOL/EOS items that fall within the 3-month reporting window.
- For NEW features: Select 5 to 10 of the most operationally important updates. Do not list everything.
Use the following Markdown structure exactly:
- EOL/EOS
  - [서비스명]
    - [딱 1줄짜리 핵심 내용 및 일정]
- NEW
  - [서비스명]
    - [딱 1줄짜리 핵심 요약 내용]
    - [URL 주소]

## SPEECH RULES
Generate `script.speech` by selecting ONLY the Top 3-5 most critical items overall from the `script.outline`. (Do not explain everything in the outline; you must strictly select 3-5 items for the actual speech).
Target roughly five minutes (1,000-1,500 Korean characters). Explain the selected items naturally for a presenter. Speak the way a person actually talks in a briefing — no bullet-list cadence, no hedging, no AI-sounding filler. Use polite spoken Korean (e.g., "~알려야 합니다").

For an EOL/EOS item, follow this order:
  1) 상태 — what ends, and when
  2) 조치 — what we concretely have to do about it
  3) 범위/효과 — which customers or workloads it hits, and how widely
For a new feature, follow this order:
  1) 짧은 소개 — what it is, in one sentence
  2) 효과 — what actually improves in practice
  3) 해결하는 기존의 고충 — the existing pain it removes for us or for the customer
For a billing / cost / FinOps item, follow this order:
  1) 변경 내용 — what AWS changed
  2) FitCloud 관점 — what our billing portal team should absorb or mirror
  3) 판단/결정 — the concrete decision that team now has to make

Do not include skipped items, unsupported assumptions, or confidential information.
"""

# ==============================================================================
# tool-use 스키마
# ==============================================================================

_SKIP_REASONS = [
    "confidential",
    "billing_and_cost",
    "organizations",
    "identity_and_governance",
    "not_core_service",
    "minor_patch",
    "too_far_future",
    "eol_eos_skipped_in_sales",
    "no_public_url",
]

_SKIPPED_SCHEMA = {
    "type": "array",
    "description": "Items deliberately excluded, so omissions can be audited.",
    "items": {
        "type": "object",
        "properties": {
            "title": {"type": "string", "description": "Service or item name as it appears."},
            "reason": {"type": "string", "enum": _SKIP_REASONS},
        },
        "required": ["title", "reason"],
    },
}

_SOURCE_QUOTE = {
    "type": "string",
    "description": "Span copied verbatim from the source document. Never paraphrased.",
}

_WHATS_NEW_ITEM = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "description": "Service name."},
        "badge": {"type": "string", "description": "GA | PREVIEW, plus optional region note."},
        "date": {"type": "string", "description": "YYYY.MM.DD, or empty string."},
        "body": {"type": "string", "description": "2-3 line Korean summary."},
        "url": {"type": "string", "description": "Verbatim source URL, or empty string."},
        "source_quote": _SOURCE_QUOTE,
    },
    "required": ["title", "badge", "date", "body", "url", "source_quote"],
}

_EOL_ITEM = {
    "type": "object",
    "properties": {
        "service": {"type": "string"},
        "target": {
            "type": "string",
            "description": (
                "Affected version or component ONLY, e.g. '3.05 / 3.06' or '.NET 8'. "
                "Never repeat the service name here. If the whole service is affected "
                "with no specific version, use an empty string."
            ),
        },
        "date": {"type": "string", "description": "YYYY.MM.DD, or empty string."},
        "action": {"type": "string", "description": "Korean migration target or required action."},
        "badge": {"type": "string", "description": "EOL | EOS, plus optional region note."},
        "source_quote": _SOURCE_QUOTE,
    },
    "required": ["service", "target", "date", "action", "badge", "source_quote"],
}

TOOL_SALES = {
    "name": "submit_sales_report",
    "description": (
        "Submit the extracted What's New items for the sales-facing report. "
        "Pass `items` as a real JSON array of objects, never as a stringified blob."
    ),
    "inputSchema": {
        "json": {
            "type": "object",
            "properties": {
                "intro": {"type": "string", "description": "2-3 line Korean summary focusing on new features."},
                "items": {"type": "array", "items": _WHATS_NEW_ITEM},
                "skipped": _SKIPPED_SCHEMA,
            },
            "required": ["intro", "items", "skipped"],
        }
    },
}

TOOL_CUSTOMER = {
    "name": "submit_customer_report",
    "description": "Submit EOL/EOS items and core-service updates for the customer report.",
    "inputSchema": {
        "json": {
            "type": "object",
            "properties": {
                "intro": {"type": "string", "description": "3-4 line Korean summary, conclusion first."},
                "eol_eos": {"type": "array", "items": _EOL_ITEM},
                "whats_new": {"type": "array", "items": _WHATS_NEW_ITEM},
                "skipped": _SKIPPED_SCHEMA,
            },
            "required": ["intro", "eol_eos", "whats_new", "skipped"],
        }
    },
}

TOOL_SCRIPT = {
    "name": "submit_script",
    "description": "Submit the seminar outline and spoken script.",
    "inputSchema": {
        "json": {
            "type": "object",
            "properties": {
                "outline": {"type": "string", "description": "Korean markdown-ish outline."},
                "speech": {"type": "string", "description": "Korean spoken script, 1000-1500 chars."},
            },
            "required": ["outline", "speech"],
        }
    },
}
