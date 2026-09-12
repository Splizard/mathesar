import {
  type CardColumn,
  chooseDefaultCard,
  columnsShownBySummary,
} from '../defaultCard';

function column(
  attnum: number,
  { key = false, textual = false, stamp = false } = {},
): CardColumn {
  return { attnum, isPrimaryKey: key, isTextual: textual, isStamp: stamp };
}

/** id, name, note, made -- a table shaped the way most tables are */
const ordinary: CardColumn[] = [
  column(1, { key: true }),
  column(2, { textual: true }),
  column(3, { textual: true }),
  column(4),
];

describe('which columns a summary is already showing', () => {
  test('with no template, the first string column, which is what the server picks', () => {
    expect(columnsShownBySummary(ordinary, null)).toEqual(new Set([2]));
  });

  test('with no string column, the first column of any type', () => {
    const numbers = [column(1, { key: true }), column(5), column(9)];
    expect(columnsShownBySummary(numbers, null)).toEqual(new Set([1]));
  });

  test('by attnum rather than by where the table shows the column', () => {
    // The same columns, shown in an order somebody has dragged them into.
    const dragged = [ordinary[2], ordinary[3], ordinary[0], ordinary[1]];
    expect(columnsShownBySummary(dragged, null)).toEqual(new Set([2]));
  });

  test('a template says, and says only about this table', () => {
    // "{name}, of {the town its address is in}"
    const template = [[2], ', of ', [7, 4]];
    expect(columnsShownBySummary(ordinary, template)).toEqual(new Set([2, 7]));
  });

  test('a table with no columns at all shows nothing', () => {
    expect(columnsShownBySummary([], null)).toEqual(new Set());
  });
});

describe('choosing a card for a table nobody has configured one for', () => {
  test('the first two columns the summary has not already said', () => {
    expect(chooseDefaultCard(ordinary, null)).toEqual({
      secondary: 3,
      aside: 4,
    });
  });

  test('in the order the table is shown in, not the order it was built in', () => {
    const dragged = [ordinary[3], ordinary[0], ordinary[1], ordinary[2]];
    expect(chooseDefaultCard(dragged, null)).toEqual({
      secondary: 4,
      aside: 3,
    });
  });

  test('a key says what the record is rather than anything about it', () => {
    const keyLast = [column(1, { textual: true }), column(2, { key: true })];
    expect(chooseDefaultCard(keyLast, null)).toEqual({
      secondary: undefined,
      aside: undefined,
    });
  });

  test('a table with one column to spare fills one cell and leaves the other', () => {
    const two = [column(1, { key: true }), column(2, { textual: true })];
    expect(chooseDefaultCard(two, null)).toEqual({
      secondary: undefined,
      aside: undefined,
    });
    const three = [...two, column(3)];
    expect(chooseDefaultCard(three, null)).toEqual({
      secondary: 3,
      aside: undefined,
    });
  });

  test('a template is taken at its word about what it shows', () => {
    expect(chooseDefaultCard(ordinary, [[3]])).toEqual({
      secondary: 2,
      aside: 4,
    });
  });

  test('what the database stamps on a record waits its turn', () => {
    // id, name, made, touched, done, urgency -- the stamps sitting in the middle.
    const stamped: CardColumn[] = [
      column(1, { key: true }),
      column(2, { textual: true }),
      column(3, { stamp: true }),
      column(4, { stamp: true }),
      column(5),
      column(6),
    ];
    expect(chooseDefaultCard(stamped, null)).toEqual({
      secondary: 5,
      aside: 6,
    });
  });

  test('a stamp beats an empty cell, where the table holds nothing else', () => {
    const onlyStamps: CardColumn[] = [
      column(1, { key: true }),
      column(2, { textual: true }),
      column(3, { stamp: true }),
      column(4, { stamp: true }),
    ];
    expect(chooseDefaultCard(onlyStamps, null)).toEqual({
      secondary: 3,
      aside: 4,
    });
  });
});
