/**
 * Hearing that somebody else has changed the table being looked at.
 *
 * Mathesar says what it changed as it changes it, Postgres carries the message, and a websocket
 * hands it on to the pages watching that table (see mathesar/realtime/changes.py). What arrives
 * says what happened and to which records, never the values: the page is being told that what it
 * is showing is out of date, and what it does about that is ask again, through the same RPC and
 * the same privileges as before.
 */

/** What the server says when something changes */
export interface Change {
  /** The OID of the table whose records changed */
  table: number;
  op: 'insert' | 'update' | 'delete';
  /** The primary keys of the records, as text. Empty for a change too large to list. */
  keys: string[];
  /** How many records changed, which is more than `keys` holds for a large change */
  count: number;
}

export function isChange(value: unknown): value is Change {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<Change>;
  return (
    typeof candidate.table === 'number' &&
    (candidate.op === 'insert' ||
      candidate.op === 'update' ||
      candidate.op === 'delete') &&
    Array.isArray(candidate.keys) &&
    typeof candidate.count === 'number'
  );
}

/** Read a change out of what came down the socket, or nothing if it is not one */
export function readChange(data: unknown): Change | undefined {
  if (typeof data !== 'string') return undefined;
  try {
    const parsed: unknown = JSON.parse(data);
    return isChange(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export interface WatchProps {
  databaseId: number;
  /** The tables to hear about. None means every table of the database. */
  tables: number[];
  onChange: (change: Change) => void;
  /** Made injectable so that this can be tested without a server to connect to */
  open?: (url: string) => WebSocket;
  /** How long to wait before trying again, made injectable for the same reason */
  wait?: (ms: number) => Promise<void>;
}

/** Where the socket lives, as an absolute URL against wherever the page came from */
export function changesUrl(): string {
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${window.location.host}/ws/changes`;
}

const firstRetryMs = 1000;
const longestRetryMs = 30000;
/**
 * How many times to try before deciding there is nothing there.
 *
 * A websocket needs an ASGI server in front of it. Served by the WSGI one, the pages work exactly
 * as before and this never connects -- so it stops trying rather than knocking at a door that was
 * never going to open. A socket that has been accepted once is a different matter: the reasons it
 * closes later are a laptop that slept and a server that restarted, and those come back.
 */
const triesBeforeGivingUp = 4;

/**
 * Watch for changes until the returned function is called.
 *
 * A socket that closes is opened again, waiting longer each time up to half a minute: the reasons
 * it closes are a page left open while a laptop slept and a server being restarted, and both of
 * those come back. One that was never accepted in the first place is given a few tries and then
 * left alone; see triesBeforeGivingUp. Nothing is buffered across a reconnection, so a page that
 * missed a change while it was away is out of date until the next one -- which is why a page
 * should ask again when it reconnects rather than trusting what it has.
 */
export function watchChanges(props: WatchProps): () => void {
  const open = props.open ?? ((url: string) => new WebSocket(url));
  const wait =
    props.wait ??
    ((ms: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      }));

  let stopped = false;
  let socket: WebSocket | undefined;
  let retryMs = firstRetryMs;
  let everOpened = false;
  let tries = 0;

  function connect() {
    if (stopped) return;
    tries += 1;
    const ws = open(changesUrl());
    socket = ws;
    ws.onopen = () => {
      everOpened = true;
      retryMs = firstRetryMs;
      ws.send(
        JSON.stringify({
          database_id: props.databaseId,
          tables: props.tables,
        }),
      );
    };
    ws.onmessage = (event: MessageEvent) => {
      const change = readChange(event.data);
      if (change) props.onChange(change);
    };
    ws.onclose = () => {
      if (stopped) return;
      if (!everOpened && tries >= triesBeforeGivingUp) {
        stopped = true;
        return;
      }
      const waiting = retryMs;
      retryMs = Math.min(retryMs * 2, longestRetryMs);
      void wait(waiting).then(connect);
    };
  }

  connect();

  return () => {
    stopped = true;
    socket?.close();
  };
}
