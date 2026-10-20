/** A dispatched server-sent event. `event` defaults to "message". */
export interface SseMessage {
  event: string;
  data: string;
}

/**
 * Read a text/event-stream body and dispatch each complete event.
 * Handles events, lines and multi-byte characters split across chunk
 * boundaries, CRLF / CR / LF line endings, comments and multi-line data.
 */
export async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onMessage: (message: SseMessage) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventName = "";
  let dataLines: string[] = [];
  let hasData = false;

  const dispatch = () => {
    if (hasData) onMessage({ event: eventName || "message", data: dataLines.join("\n") });
    eventName = "";
    dataLines = [];
    hasData = false;
  };

  const handleLine = (line: string) => {
    if (line === "") {
      dispatch();
      return;
    }
    if (line.startsWith(":")) return; // comment / keep-alive
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") {
      dataLines.push(value);
      hasData = true;
    } else if (field === "event") {
      eventName = value;
    }
  };

  const drain = (final: boolean) => {
    for (;;) {
      const at = buffer.search(/\r\n|\r|\n/);
      if (at === -1) return;
      // A trailing "\r" may be the first half of a "\r\n" split across chunks.
      if (!final && buffer[at] === "\r" && at === buffer.length - 1) return;
      const width = buffer[at] === "\r" && buffer[at + 1] === "\n" ? 2 : 1;
      handleLine(buffer.slice(0, at));
      buffer = buffer.slice(at + width);
    }
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      drain(false);
    }
    buffer += decoder.decode();
    drain(true);
    if (buffer) handleLine(buffer);
    buffer = "";
    // Be lenient with a final event that lacks its blank-line terminator.
    dispatch();
  } finally {
    reader.releaseLock();
  }
}
