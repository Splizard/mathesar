import { chooseTableLayout, compactWidth } from '../viewport';

describe('choosing how a table is laid out', () => {
  test('a window with room to spare gets the spreadsheet and its panes', () => {
    expect(chooseTableLayout({ width: 1400, isPortrait: false })).toBe('sheet');
    // Tall and wide, which is a desktop window rather than a phone.
    expect(chooseTableLayout({ width: 1400, isPortrait: true })).toBe('sheet');
  });

  test('a phone on its side gets the spreadsheet and nothing else', () => {
    expect(chooseTableLayout({ width: 800, isPortrait: false })).toBe(
      'compactSheet',
    );
  });

  test('a phone held upright gets a list of records', () => {
    expect(chooseTableLayout({ width: 390, isPortrait: true })).toBe(
      'recordList',
    );
  });

  test('a narrow window on a desktop is treated as the narrow window it is', () => {
    expect(chooseTableLayout({ width: 500, isPortrait: false })).toBe(
      'compactSheet',
    );
  });

  test('the width itself decides, and exactly at the edge there is still no room', () => {
    expect(chooseTableLayout({ width: compactWidth, isPortrait: false })).toBe(
      'compactSheet',
    );
    expect(
      chooseTableLayout({ width: compactWidth + 1, isPortrait: false }),
    ).toBe('sheet');
  });
});
