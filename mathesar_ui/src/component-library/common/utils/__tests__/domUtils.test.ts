import { isTextEntry } from '../domUtils';

function element(html: string): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = html;
  return container.firstElementChild as HTMLElement;
}

describe('isTextEntry', () => {
  test.each([
    ['<input />', true],
    ['<input type="text" />', true],
    ['<input type="search" />', true],
    ['<input type="email" />', true],
    ['<input type="number" />', true],
    ['<textarea></textarea>', true],
    ['<div contenteditable="true"></div>', true],
    ['<input type="checkbox" />', false],
    ['<input type="radio" />', false],
    ['<input type="file" />', false],
    ['<input type="button" />', false],
    ['<div></div>', false],
    ['<span>some text</span>', false],
    ['<button>press</button>', false],
    ['<div contenteditable="false"></div>', false],
  ])('%s is %s', (html, expected) => {
    expect(isTextEntry(element(html))).toBe(expected);
  });

  test('follows editability down to the nearest element that declares it', () => {
    const editable = element(
      '<div contenteditable="true">' +
        '<span id="in">written here</span>' +
        '<span contenteditable="false" id="out">but not here</span>' +
        '</div>',
    );
    document.body.append(editable);
    expect(isTextEntry(editable.querySelector('#in'))).toBe(true);
    expect(isTextEntry(editable.querySelector('#out'))).toBe(false);
    editable.remove();
  });

  test('is false for what is not an element at all', () => {
    expect(isTextEntry(undefined)).toBe(false);
    expect(isTextEntry(null)).toBe(false);
    expect(isTextEntry('input')).toBe(false);
    expect(isTextEntry(document.createTextNode('hi'))).toBe(false);
  });
});
