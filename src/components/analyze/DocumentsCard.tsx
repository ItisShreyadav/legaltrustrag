"use client";

import { CircleAlertIcon, FileTextIcon, UploadIcon, XIcon } from "lucide-react";
import { useId, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemActions, ItemContent, ItemGroup, ItemMedia } from "@/components/ui/item";
import { cn } from "@/lib/utils";
import { ACCEPT_ATTR, fileKind, formatBytes, formatMb, type UploadLimits } from "./files";

interface DocumentsCardProps {
  files: readonly File[];
  /** Why files were rejected by the last add. */
  notices: readonly string[];
  limits: UploadLimits;
  /** True while an analysis is running. */
  disabled: boolean;
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
  onClear: () => void;
}

/** Drop zone (a labelled file input), the rejected-file notices and the selected files. */
export function DocumentsCard({ files, notices, limits, disabled, onAdd, onRemove, onClear }: DocumentsCardProps) {
  const inputId = useId();
  const titleId = useId();
  const [dragging, setDragging] = useState(false);
  const full = files.length >= limits.maxFiles;
  const filesWord = limits.maxFiles === 1 ? "file" : "files";

  return (
    <Card aria-labelledby={titleId} role="region">
      <CardHeader>
        <CardTitle>
          <h2 id={titleId}>Documents</h2>
        </CardTitle>
        <CardDescription>Contracts to compare. Each file is split into clauses with exact character offsets.</CardDescription>
        {files.length > 0 ? (
          <CardAction>
            <Button variant="ghost" size="sm" onClick={onClear} disabled={disabled}>
              Clear all
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div
          onDragEnter={(e) => {
            e.preventDefault();
            if (!disabled) setDragging(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = disabled ? "none" : "copy";
          }}
          onDragLeave={(e) => {
            if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
            setDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!disabled) onAdd(Array.from(e.dataTransfer.files));
          }}
        >
          <input
            id={inputId}
            type="file"
            multiple
            accept={ACCEPT_ATTR}
            disabled={disabled || full}
            className="peer sr-only"
            onChange={(e) => {
              onAdd(Array.from(e.currentTarget.files ?? []));
              e.currentTarget.value = "";
            }}
          />
          <label
            htmlFor={inputId}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center transition-colors",
              "hover:border-ring hover:bg-muted/50",
              "peer-focus-visible:border-ring peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50",
              "peer-disabled:cursor-not-allowed peer-disabled:opacity-60 peer-disabled:hover:border-border peer-disabled:hover:bg-transparent",
              dragging && "border-primary bg-muted/50",
            )}
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <UploadIcon className="size-5" />
            </span>
            <span className="text-sm font-medium">
              {dragging ? (
                "Release to add the files"
              ) : (
                <>
                  Drop PDF, DOCX or TXT files, or{" "}
                  <span className="text-primary underline underline-offset-4">browse</span>
                </>
              )}
            </span>
            <span className="text-xs text-muted-foreground">
              {full
                ? `Limit of ${limits.maxFiles} ${filesWord} reached. Remove a file to add another.`
                : `Up to ${limits.maxFiles} ${filesWord}, ${formatMb(limits.maxFileBytes)} each.`}
            </span>
          </label>
        </div>

        {notices.length > 0 ? (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertTitle>{notices.length === 1 ? "One file was not added" : `${notices.length} files were not added`}</AlertTitle>
            <AlertDescription>
              <ul className="list-disc space-y-0.5 pl-4">
                {notices.map((notice, i) => (
                  <li key={i} className="break-words">
                    {notice}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}

        {files.length > 0 ? (
          <ItemGroup aria-label="Selected documents" className="gap-2">
            {files.map((file, i) => (
              <Item key={`${file.name}-${file.size}-${i}`} role="listitem" variant="outline" size="sm" className="flex-nowrap">
                <ItemMedia variant="icon" className="text-muted-foreground">
                  <FileTextIcon />
                </ItemMedia>
                <ItemContent className="min-w-0 gap-0.5">
                  <span className="truncate text-sm leading-snug font-medium" title={file.name}>
                    {file.name}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                    doc_{i + 1} · {formatBytes(file.size)}
                  </span>
                </ItemContent>
                <ItemActions className="gap-1">
                  <Badge variant="secondary" className="font-mono">
                    {fileKind(file.name)}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onRemove(i)}
                    disabled={disabled}
                    aria-label={`Remove ${file.name}`}
                  >
                    <XIcon />
                  </Button>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        ) : null}
      </CardContent>
    </Card>
  );
}
