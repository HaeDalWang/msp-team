import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const sources = { sales: "영업용 업데이트", eol_eos: "고객용 종료 안내", whats_new: "고객용 업데이트", customer: "고객용" } as const;
const reasons: Record<string, string> = {
  confidential: "대외비 또는 미공개",
  billing_and_cost: "과금·비용 주제",
  organizations: "AWS Organizations 주제",
  identity_and_governance: "ID·거버넌스 주제",
  not_core_service: "고객용 핵심 서비스 범위 밖",
  minor_patch: "일상적인 버전·패치 변경",
  too_far_future: "종료 일정이 안내 범위 밖",
  eol_eos_skipped_in_sales: "영업용 업데이트에서 종료 안내 제외",
  no_public_url: "공개 AWS URL 없음",
};

type RecordRow = Record<string, unknown>;
const object = (value: unknown): RecordRow => value && typeof value === "object" && !Array.isArray(value) ? value as RecordRow : {};
const rows = (value: unknown): RecordRow[] => Array.isArray(value) ? value.filter((item): item is RecordRow => !!item && typeof item === "object" && !Array.isArray(item)) : [];
const text = (value: unknown) => typeof value === "string" && value.trim() ? value : "—";

export function DigestDiagnostics({ diagnostics }: { diagnostics: Record<string, unknown> }) {
  const unverified = object(diagnostics.unverified);
  const skipped = object(diagnostics.skipped);
  const evidenceRows = (["sales", "eol_eos", "whats_new"] as const).flatMap((key) => rows(unverified[key]).map((item) => ({ source: sources[key], name: text(item.name), quote: text(item.quote) })));
  const skippedRows = (["sales", "customer"] as const).flatMap((key) => rows(skipped[key]).map((item) => ({ source: sources[key], title: text(item.title), reason: reasons[String(item.reason)] ?? text(item.reason) })));
  const hasData = Object.keys(diagnostics).length > 0;

  return <div className="min-w-0 space-y-6">
    <p className="text-sm text-muted-foreground">AI 분석 결과를 원본 PDF와 대조한 뒤 공유해 주세요. 이 표는 검토가 필요한 항목을 보여줍니다.</p>
    {!hasData ? <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">분석 진단이 없습니다. PDF 분석을 실행하면 결과가 여기에 표시됩니다.</p> : <>
      <section aria-label="원문 근거 확인 필요" className="space-y-2">
        <div className="flex items-baseline gap-2"><h2 className="font-semibold">원문 근거 확인 필요</h2><span className="text-sm tabular-nums text-muted-foreground">{evidenceRows.length}건</span></div>
        {evidenceRows.length ? <Table className="[&_td]:whitespace-normal [&_td]:break-words">
          <TableHeader><TableRow><TableHead scope="col">문서 구분</TableHead><TableHead scope="col">항목</TableHead><TableHead scope="col">제출된 원문 근거</TableHead></TableRow></TableHeader>
          <TableBody>{evidenceRows.map((item, index) => <TableRow key={index}><TableCell>{item.source}</TableCell><TableCell className="font-medium">{item.name}</TableCell><TableCell className="max-w-80">{item.quote}</TableCell></TableRow>)}</TableBody>
        </Table> : <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">원문에서 찾지 못한 근거가 없습니다.</p>}
      </section>
      <section aria-label="분석에서 제외된 항목" className="space-y-2">
        <div className="flex items-baseline gap-2"><h2 className="font-semibold">분석에서 제외된 항목</h2><span className="text-sm tabular-nums text-muted-foreground">{skippedRows.length}건</span></div>
        {skippedRows.length ? <Table className="[&_td]:whitespace-normal [&_td]:break-words">
          <TableHeader><TableRow><TableHead scope="col">문서 구분</TableHead><TableHead scope="col">항목</TableHead><TableHead scope="col">제외 사유</TableHead></TableRow></TableHeader>
          <TableBody>{skippedRows.map((item, index) => <TableRow key={index}><TableCell>{item.source}</TableCell><TableCell className="font-medium">{item.title}</TableCell><TableCell>{item.reason}</TableCell></TableRow>)}</TableBody>
        </Table> : <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">제외된 항목이 없습니다.</p>}
      </section>
    </>}
  </div>;
}
