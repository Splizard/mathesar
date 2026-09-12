import {
  type Formula,
  type FormulaTableColumn,
  parseFormula,
  unparseFormula,
} from '../formula';

const columns: FormulaTableColumn[] = [
  { id: 1, name: 'id' },
  { id: 2, name: 'item' },
  { id: 3, name: 'quantity' },
  { id: 4, name: 'price' },
  { id: 5, name: 'Unit Cost' },
];

function read(text: string): Formula {
  const reading = parseFormula(text, columns);
  if (!reading.ok) {
    throw new Error(`expected a formula, got ${reading.problem.code}`);
  }
  return reading.formula;
}

function problem(text: string): string {
  const reading = parseFormula(text, columns);
  if (reading.ok) throw new Error('expected a problem, got a formula');
  return reading.problem.code;
}

describe('reading a formula', () => {
  test('a column by name', () => {
    expect(read('quantity')).toEqual({ column: 3 });
  });

  test('a column whose name needs brackets', () => {
    expect(read('[Unit Cost]')).toEqual({ column: 5 });
  });

  test('a column named without minding its capitals', () => {
    expect(read('QUANTITY')).toEqual({ column: 3 });
  });

  test('values of each kind', () => {
    expect(read('5')).toEqual({ value: 5 });
    expect(read('1.25')).toEqual({ value: 1.25 });
    expect(read("'a note'")).toEqual({ value: 'a note' });
    expect(read('true')).toEqual({ value: true });
    expect(read('null')).toEqual({ value: null });
  });

  test('a quote inside a value is written twice over', () => {
    expect(read("'O''Brien'")).toEqual({ value: "O'Brien" });
  });

  test('multiplication of two columns', () => {
    expect(read('quantity * price')).toEqual({
      op: '*',
      of: [{ column: 3 }, { column: 4 }],
    });
  });

  test('multiplying binds tighter than adding', () => {
    expect(read('1 + 2 * 3')).toEqual({
      op: '+',
      of: [{ value: 1 }, { op: '*', of: [{ value: 2 }, { value: 3 }] }],
    });
  });

  test('brackets say otherwise', () => {
    expect(read('(1 + 2) * 3')).toEqual({
      op: '*',
      of: [{ op: '+', of: [{ value: 1 }, { value: 2 }] }, { value: 3 }],
    });
  });

  test('subtracting goes left to right', () => {
    expect(read('10 - 3 - 2')).toEqual({
      op: '-',
      of: [{ op: '-', of: [{ value: 10 }, { value: 3 }] }, { value: 2 }],
    });
  });

  test('raising to a power goes right to left, as Postgres reads it', () => {
    expect(read('2 ^ 3 ^ 2')).toEqual({
      op: '^',
      of: [{ value: 2 }, { op: '^', of: [{ value: 3 }, { value: 2 }] }],
    });
  });

  test('a minus sign in front of something', () => {
    expect(read('-price')).toEqual({ op: '-', of: [{ column: 4 }] });
  });

  test('joining text', () => {
    expect(read("item || ' x' || quantity")).toEqual({
      op: '||',
      of: [{ column: 2 }, { value: ' x' }, { column: 3 }],
    });
  });

  test('a function', () => {
    expect(read('round(price, 2)')).toEqual({
      fn: 'round',
      of: [{ column: 4 }, { value: 2 }],
    });
  });

  test('a function inside a function', () => {
    expect(read('upper(btrim(item))')).toEqual({
      fn: 'upper',
      of: [{ fn: 'btrim', of: [{ column: 2 }] }],
    });
  });

  test('comparing, and joining the comparisons', () => {
    expect(read('quantity >= 10 and price < 5')).toEqual({
      op: 'AND',
      of: [
        { op: '>=', of: [{ column: 3 }, { value: 10 }] },
        { op: '<', of: [{ column: 4 }, { value: 5 }] },
      ],
    });
  });

  test('!= is taken as the <> Postgres spells it', () => {
    expect(read('quantity != 1')).toEqual({
      op: '<>',
      of: [{ column: 3 }, { value: 1 }],
    });
  });

  test('asking whether something is there', () => {
    expect(read('price is null')).toEqual({
      op: 'IS NULL',
      of: [{ column: 4 }],
    });
    expect(read('price is not null')).toEqual({
      op: 'IS NOT NULL',
      of: [{ column: 4 }],
    });
  });

  test('not', () => {
    expect(read('not price is null')).toEqual({
      op: 'NOT',
      of: [{ op: 'IS NULL', of: [{ column: 4 }] }],
    });
  });

  test('a choice between two answers', () => {
    expect(read("if(quantity >= 10, 'bulk', 'single')")).toEqual({
      if: { op: '>=', of: [{ column: 3 }, { value: 10 }] },
      then: { value: 'bulk' },
      else: { value: 'single' },
    });
  });

  test('a choice with nothing to say otherwise', () => {
    expect(read("if(quantity >= 10, 'bulk')")).toEqual({
      if: { op: '>=', of: [{ column: 3 }, { value: 10 }] },
      then: { value: 'bulk' },
    });
  });
});

describe('a formula that cannot be read', () => {
  test('nothing at all', () => {
    expect(problem('')).toBe('formula_is_empty');
    expect(problem('   ')).toBe('formula_is_empty');
  });

  test('a column the table has not got', () => {
    expect(problem('turnover')).toBe('formula_has_no_such_column');
    expect(problem('[No Such Thing]')).toBe('formula_has_no_such_column');
  });

  test('a function that is not one of the functions', () => {
    expect(problem('pg_sleep(10)')).toBe('formula_has_no_such_function');
    expect(problem('concat(item, item)')).toBe('formula_has_no_such_function');
  });

  test('a quote left open', () => {
    expect(problem("'unfinished")).toBe('formula_quote_unclosed');
  });

  test('a bracket left open', () => {
    expect(problem('[Unit Cost')).toBe('formula_bracket_unclosed');
    expect(problem('round(price')).toBe('formula_paren_unclosed');
  });

  test('an operator with nothing after it', () => {
    expect(problem('price *')).toBe('formula_wants_something_here');
  });

  test('something that is not part of the grammar', () => {
    expect(problem('price & 2')).toBe('formula_does_not_understand');
    expect(problem('price price')).toBe('formula_does_not_understand');
  });

  test('a statement smuggled in is not read as one', () => {
    // There is no reading of this, and so nothing is sent for the server to refuse.
    expect(problem('price; DROP TABLE orders; --')).toBe(
      'formula_does_not_understand',
    );
  });
});

describe('writing a formula back out', () => {
  function roundTrip(text: string): string {
    return unparseFormula(read(text), columns);
  }

  test('what comes out reads as what went in', () => {
    expect(roundTrip('quantity * price')).toBe('quantity * price');
    expect(roundTrip('round(price, 2)')).toBe('round(price, 2)');
    expect(roundTrip("item || ' x'")).toBe("item || ' x'");
    expect(roundTrip('[Unit Cost] + 1')).toBe('[Unit Cost] + 1');
    expect(roundTrip('price is not null')).toBe('price is not null');
    expect(roundTrip("if(quantity >= 10, 'bulk', 'single')")).toBe(
      "if(quantity >= 10, 'bulk', 'single')",
    );
  });

  test('only the brackets that are needed are written', () => {
    expect(roundTrip('1 + 2 * 3')).toBe('1 + 2 * 3');
    expect(roundTrip('(1 + 2) * 3')).toBe('(1 + 2) * 3');
    expect(roundTrip('10 - (3 - 2)')).toBe('10 - (3 - 2)');
    expect(roundTrip('10 - 3 - 2')).toBe('10 - 3 - 2');
  });

  test('a quote in a value is written twice over again', () => {
    expect(roundTrip("'O''Brien'")).toBe("'O''Brien'");
  });

  test('reading what was written gives the same formula', () => {
    const written = [
      'quantity * price',
      'round(price * 1.15, 2)',
      "upper(item) || ' x' || quantity",
      'if(price is null, 0, price)',
      'not (quantity > 1 and price > 1)',
      '-price + 1',
    ];
    written.forEach((text) => {
      const once = read(text);
      expect(read(unparseFormula(once, columns))).toEqual(once);
    });
  });

  test('a column that is no longer there is said so rather than written as a name', () => {
    expect(unparseFormula({ column: 99 }, columns)).toBe('[?99]');
  });

  test('a column whose name is a word the grammar uses is bracketed', () => {
    expect(unparseFormula({ column: 7 }, [{ id: 7, name: 'if' }])).toBe('[if]');
  });
});
