import {
  type CardSource,
  cardHasAnything,
  renderCard,
  renderTemplate,
} from '../renderCard';

const source: CardSource = {
  values: {
    1: 7,
    2: 'The Hobbit',
    3: 4,
    4: 'Shelf B',
    5: null,
    6: '',
  },
  linkedSummaries: (attnum, value) =>
    attnum === 3 && value === 4 ? 'J. R. R. Tolkien' : undefined,
};

describe('filling in one slot of a card', () => {
  test('a column of the table is read straight off the record', () => {
    expect(renderTemplate([[2]], source)).toBe('The Hobbit');
  });

  test('text around a reference is kept', () => {
    expect(renderTemplate(['“', [2], '”'], source)).toBe('“The Hobbit”');
  });

  test('a number is written out as one', () => {
    expect(renderTemplate([[1]], source)).toBe('7');
  });

  test('a reference through a foreign key shows the linked record', () => {
    expect(renderTemplate(['by ', [3, 9]], source)).toBe('by J. R. R. Tolkien');
  });

  test('a longer chain than the page holds leaves the slot empty', () => {
    expect(renderTemplate([[3, 9, 11]], source)).toBe('');
  });

  test('a slot whose references all lead nowhere is empty, not its punctuation', () => {
    // "by " on its own says less than an empty line does.
    expect(renderTemplate(['by ', [5]], source)).toBe('');
    expect(renderTemplate(['by ', [99]], source)).toBe('');
  });

  test('a slot of nothing but text is that text', () => {
    expect(renderTemplate(['Untitled'], source)).toBe('Untitled');
  });

  test('nothing at all', () => {
    expect(renderTemplate(undefined, source)).toBe('');
    expect(renderTemplate([], source)).toBe('');
  });

  test('a column whose type is shown its own way is asked about', () => {
    const formatted: CardSource = {
      ...source,
      format: (attnum, value) => (attnum === 1 ? `#${String(value)}` : ''),
    };
    expect(renderTemplate([[1]], formatted)).toBe('#7');
  });
});

describe('filling in a whole card', () => {
  test('the three slots', () => {
    expect(
      renderCard(
        { primary: [[2]], secondary: ['by ', [3, 9]], aside: [[4]] },
        source,
      ),
    ).toEqual({
      primary: 'The Hobbit',
      secondary: 'by J. R. R. Tolkien',
      aside: 'Shelf B',
    });
  });

  test('a card of nothing but a primary', () => {
    expect(renderCard({ primary: [[2]] }, source)).toEqual({
      primary: 'The Hobbit',
      secondary: '',
      aside: '',
    });
  });

  test('no card at all', () => {
    expect(renderCard(null, source)).toBeUndefined();
    expect(renderCard(undefined, source)).toBeUndefined();
  });

  test('whether there is anything worth showing', () => {
    expect(cardHasAnything(renderCard({ primary: [[2]] }, source))).toBe(true);
    expect(cardHasAnything(renderCard({ primary: [[5]] }, source))).toBe(false);
    expect(cardHasAnything(undefined)).toBe(false);
  });
});
