import { type Change, readChange, watchChanges } from '../changes';

/** Stands in for a socket, so that this is about what the client does rather than about a server */
class FakeSocket {
  static opened: FakeSocket[] = [];

  url: string;

  sent: string[] = [];

  closed = false;

  onopen: (() => void) | null = null;

  onmessage: ((event: MessageEvent) => void) | null = null;

  onclose: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeSocket.opened.push(this);
  }

  send(text: string) {
    this.sent.push(text);
  }

  close() {
    this.closed = true;
  }

  /** What the server doing its part looks like from here */
  accept() {
    this.onopen?.();
  }

  say(text: string) {
    this.onmessage?.({ data: text } as MessageEvent);
  }

  hangUp() {
    this.onclose?.();
  }
}

const change: Change = {
  table: 16385,
  op: 'update',
  keys: ['7'],
  count: 1,
};

function watch(onChange: (c: Change) => void, waits: number[] = []) {
  return watchChanges({
    databaseId: 3,
    tables: [16385],
    onChange,
    open: (url) => new FakeSocket(url) as unknown as WebSocket,
    wait: async (ms) => {
      waits.push(ms);
    },
  });
}

beforeEach(() => {
  FakeSocket.opened = [];
  Object.defineProperty(window, 'location', {
    value: { protocol: 'http:', host: 'example.test:8000' },
    writable: true,
  });
});

describe('reading what came down the socket', () => {
  test('a change', () => {
    expect(readChange(JSON.stringify(change))).toEqual(change);
  });

  test('something that is not a change', () => {
    expect(readChange('not json')).toBeUndefined();
    expect(readChange(JSON.stringify({ table: 1 }))).toBeUndefined();
    expect(
      readChange(JSON.stringify({ ...change, op: 'sing' })),
    ).toBeUndefined();
    expect(readChange(undefined)).toBeUndefined();
    expect(readChange(42)).toBeUndefined();
  });

  test('a change too large to list its records still says how many', () => {
    const large = { table: 16385, op: 'delete', keys: [], count: 4000 };
    expect(readChange(JSON.stringify(large))).toEqual(large);
  });
});

describe('watching for changes', () => {
  test('the socket is opened where the page came from', () => {
    watch(() => {});
    expect(FakeSocket.opened[0].url).toBe('ws://example.test:8000/ws/changes');
  });

  test('a secure page asks for a secure socket', () => {
    Object.defineProperty(window, 'location', {
      value: { protocol: 'https:', host: 'example.test' },
      writable: true,
    });
    watch(() => {});
    expect(FakeSocket.opened[0].url).toBe('wss://example.test/ws/changes');
  });

  test('it says what it wants to watch as soon as it is accepted', () => {
    watch(() => {});
    const socket = FakeSocket.opened[0];
    expect(socket.sent).toEqual([]);
    socket.accept();
    expect(JSON.parse(socket.sent[0])).toEqual({
      database_id: 3,
      tables: [16385],
    });
  });

  test('a change is handed on', () => {
    const heard: Change[] = [];
    watch((c) => heard.push(c));
    FakeSocket.opened[0].say(JSON.stringify(change));
    expect(heard).toEqual([change]);
  });

  test('something that is not a change is not handed on', () => {
    const heard: Change[] = [];
    watch((c) => heard.push(c));
    FakeSocket.opened[0].say('rubbish');
    expect(heard).toEqual([]);
  });

  test('a socket that closes is opened again', async () => {
    const waits: number[] = [];
    watch(() => {}, waits);
    FakeSocket.opened[0].hangUp();
    await Promise.resolve();
    await Promise.resolve();
    expect(waits).toEqual([1000]);
    expect(FakeSocket.opened).toHaveLength(2);
  });

  test('and waits longer each time, up to a point', async () => {
    const waits: number[] = [];
    watch(() => {}, waits);
    // Accepted once, so this is a socket that went away rather than one that was never there.
    FakeSocket.opened[0].accept();
    for (let i = 0; i < 8; i += 1) {
      FakeSocket.opened[FakeSocket.opened.length - 1].hangUp();
      // Let the retry chain run.
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    }
    expect(waits[0]).toBe(1000);
    expect(waits[1]).toBe(2000);
    expect(Math.max(...waits)).toBe(30000);
  });

  test('the wait starts over once a socket is accepted', async () => {
    const waits: number[] = [];
    watch(() => {}, waits);
    FakeSocket.opened[0].hangUp();
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    FakeSocket.opened[1].accept();
    FakeSocket.opened[1].hangUp();
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(waits).toEqual([1000, 1000]);
  });

  test('giving up closes the socket and stops opening them', async () => {
    const waits: number[] = [];
    const stop = watch(() => {}, waits);
    stop();
    expect(FakeSocket.opened[0].closed).toBe(true);
    FakeSocket.opened[0].hangUp();
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(FakeSocket.opened).toHaveLength(1);
    expect(waits).toEqual([]);
  });
});

describe('a socket that was never there', () => {
  test('is given a few tries and then left alone', async () => {
    const waits: number[] = [];
    watch(() => {}, waits);
    for (let i = 0; i < 8; i += 1) {
      const last = FakeSocket.opened[FakeSocket.opened.length - 1];
      last.hangUp();
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    }
    // Four tries, so three waits between them, and then no more.
    expect(FakeSocket.opened).toHaveLength(4);
    expect(waits).toEqual([1000, 2000, 4000]);
  });

  test('while one that was accepted keeps being opened again', async () => {
    const waits: number[] = [];
    watch(() => {}, waits);
    FakeSocket.opened[0].accept();
    for (let i = 0; i < 8; i += 1) {
      const last = FakeSocket.opened[FakeSocket.opened.length - 1];
      last.hangUp();
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    }
    expect(FakeSocket.opened.length).toBeGreaterThan(4);
  });
});
