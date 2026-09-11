import ColumnWindow from '../ColumnWindow';

// Ten 100px columns, after a 50px row header column
const columns = new Map(
  Array.from({ length: 10 }, (_, i) => [
    `c${i}`,
    { left: 50 + i * 100, width: 100 },
  ]),
);
columns.set('rowHeader', { left: 0, width: 50 });

describe('ColumnWindow', () => {
  test('includes visible columns plus half a viewport on each side', () => {
    const ids = new ColumnWindow().get(columns, 400, 200, undefined);
    // visible 400..600, with margin 300..700
    expect([...(ids ?? [])].sort()).toEqual(['c2', 'c3', 'c4', 'c5', 'c6']);
  });

  test('always includes the given column', () => {
    const ids = new ColumnWindow().get(columns, 0, 200, 'c9');
    expect(ids?.has('c9')).toBe(true);
    expect(ids?.has('c5')).toBe(false);
  });

  test('returns the same Set while membership is unchanged', () => {
    const window = new ColumnWindow();
    const a = window.get(columns, 400, 200, undefined);
    const b = window.get(columns, 410, 200, undefined);
    const c = window.get(columns, 800, 200, undefined);
    expect(b).toBe(a);
    expect(c).not.toBe(a);
  });

  test('renders everything until the viewport has been measured', () => {
    expect(new ColumnWindow().get(columns, 0, 0, undefined)).toBeUndefined();
  });
});
