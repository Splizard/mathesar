import RowSlotAllocator from '../RowSlotAllocator';

type IsStateful = (key: string | number) => boolean;

const items = (...keys: string[]) => keys.map((key) => ({ key }));
const notStateful: IsStateful = () => false;

function slotKeys(
  allocator: RowSlotAllocator,
  keys: string[],
  stateful: IsStateful = notStateful,
) {
  return Object.fromEntries(
    allocator.assign(items(...keys), stateful).map((i) => [i.key, i.slotKey]),
  );
}

describe('RowSlotAllocator', () => {
  test('rows that stay rendered keep their slot', () => {
    const allocator = new RowSlotAllocator();
    const first = slotKeys(allocator, ['a', 'b', 'c']);
    const second = slotKeys(allocator, ['b', 'c', 'd']);
    expect(second.b).toBe(first.b);
    expect(second.c).toBe(first.c);
  });

  test('rows scrolling in reuse the slots of rows scrolling out', () => {
    const allocator = new RowSlotAllocator();
    const first = slotKeys(allocator, ['a', 'b', 'c']);
    const second = slotKeys(allocator, ['x', 'y', 'z']);
    expect(new Set(Object.values(second))).toEqual(
      new Set(Object.values(first)),
    );
  });

  test('slot keys are unique and output is in stable slot order', () => {
    const allocator = new RowSlotAllocator();
    allocator.assign(items('a', 'b', 'c', 'd'), notStateful);
    const result = allocator.assign(items('c', 'd', 'e', 'f'), notStateful);
    const keys = result.map((i) => i.slotKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(['0-0', '1-0', '2-0', '3-0']);
    // e and f took the slots freed by a and b; c and d did not move
    expect(result.map((i) => i.key)).toEqual(['e', 'f', 'c', 'd']);
  });

  test('a slot that held a stateful row gets a fresh key when reused', () => {
    const allocator = new RowSlotAllocator();
    const first = slotKeys(allocator, ['a', 'b']);
    const isStateful = (key: string | number) => key === 'a';
    const second = slotKeys(allocator, ['b', 'c'], isStateful);
    expect(second.b).toBe(first.b);
    expect(second.c).not.toBe(first.a);
    expect(Object.values(second)).not.toContain(first.a);
  });

  test('handles the rendered range growing and shrinking', () => {
    const allocator = new RowSlotAllocator();
    slotKeys(allocator, ['a', 'b']);
    const grown = allocator.assign(items('a', 'b', 'c', 'd'), notStateful);
    expect(new Set(grown.map((i) => i.slotKey)).size).toBe(4);
    const shrunk = allocator.assign(items('d'), notStateful);
    expect(shrunk).toHaveLength(1);
  });
});
