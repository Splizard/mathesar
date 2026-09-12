import { chooseTableLayout, compactHeight, compactWidth } from '../viewport';

describe('choosing how a table is laid out', () => {
  test('a window with room to spare gets the spreadsheet and its panes', () => {
    expect(
      chooseTableLayout({ width: 1400, height: 900, isPortrait: false }),
    ).toBe('sheet');
    // Tall and wide, which is a desktop window rather than a phone.
    expect(
      chooseTableLayout({ width: 1400, height: 900, isPortrait: true }),
    ).toBe('sheet');
  });

  test('a phone on its side gets the spreadsheet and nothing else', () => {
    expect(
      chooseTableLayout({ width: 800, height: 390, isPortrait: false }),
    ).toBe('compactSheet');
  });

  test('a big phone on its side is wide, and still has no room for the panes', () => {
    // 932x430 is a phone held sideways, and wider than plenty of laptops are.
    expect(
      chooseTableLayout({ width: 932, height: 430, isPortrait: false }),
    ).toBe('compactSheet');
  });

  test('a phone held upright gets a list of records', () => {
    expect(
      chooseTableLayout({ width: 390, height: 844, isPortrait: true }),
    ).toBe('recordList');
  });

  test('a narrow window on a desktop is treated as the narrow window it is', () => {
    expect(
      chooseTableLayout({ width: 500, height: 900, isPortrait: false }),
    ).toBe('compactSheet');
  });

  test('a short window on a desktop is treated as the short window it is', () => {
    expect(
      chooseTableLayout({ width: 1400, height: 420, isPortrait: false }),
    ).toBe('compactSheet');
  });

  test('the room itself decides, and exactly at either edge there is still none', () => {
    expect(
      chooseTableLayout({
        width: compactWidth,
        height: compactHeight + 1,
        isPortrait: false,
      }),
    ).toBe('compactSheet');
    expect(
      chooseTableLayout({
        width: compactWidth + 1,
        height: compactHeight,
        isPortrait: false,
      }),
    ).toBe('compactSheet');
    expect(
      chooseTableLayout({
        width: compactWidth + 1,
        height: compactHeight + 1,
        isPortrait: false,
      }),
    ).toBe('sheet');
  });
});
