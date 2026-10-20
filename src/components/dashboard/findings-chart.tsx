"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

export interface FindingsChartRow {
  id: string;
  /** Axis label, e.g. "Oct 13". */
  label: string;
  /** "2026-10-13 14:02 UTC". */
  date: string;
  documents: string;
  findings: number;
  withheld: number;
}

const chartConfig = {
  findings: { label: "Findings", color: "var(--chart-1)" },
  withheld: { label: "Withheld", color: "var(--chart-5)" },
} satisfies ChartConfig;

/** Findings and withheld candidates for the most recent runs, oldest on the left. */
export function FindingsChart({ rows }: { rows: readonly FindingsChartRow[] }) {
  const labels = new Map(rows.map((row) => [row.id, row.label]));

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>
          <h2>Findings per run</h2>
        </CardTitle>
        <CardDescription>
          Verified findings and withheld candidates for your last {rows.length} runs.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-56 w-full"
          role="img"
          aria-label={`Bar chart of findings and withheld candidates for the last ${rows.length} runs`}
        >
          <BarChart data={[...rows]} margin={{ left: 0, right: 4, top: 4 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="id"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={16}
              tickFormatter={(id: string) => labels.get(id) ?? ""}
            />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) => {
                    const row = payload?.[0]?.payload as FindingsChartRow | undefined;
                    if (!row) return null;
                    return (
                      <span className="flex max-w-64 flex-col gap-0.5">
                        <span className="truncate">{row.documents}</span>
                        <span className="font-mono font-normal text-muted-foreground">{row.date}</span>
                      </span>
                    );
                  }}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Bar dataKey="findings" fill="var(--color-findings)" radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Bar dataKey="withheld" fill="var(--color-withheld)" radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
