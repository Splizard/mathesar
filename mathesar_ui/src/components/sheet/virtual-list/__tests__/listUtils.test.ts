import listUtils, { type Props } from '../listUtils';

// 100 items of 10px in a 50px viewport, overscanning 5 on each side
function renderedRange(scrollOffset: number, overscanCount = 5) {
  const props: Props = {
    itemSize: () => 10,
    instanceProps: {
      lastMeasuredIndex: -1,
      itemMetadataMap: {},
      styleCache: {},
    },
    isScrolling: false,
    scrollDirection: 'forward',
    itemCount: 100,
    overscanCount,
    scrollOffset,
    height: 50,
    itemKey: listUtils.defaultItemKey,
    estimatedItemSize: 10,
  };
  const { startIndex, stopIndex } = listUtils.getItemsInfo(props);
  return [startIndex, stopIndex];
}

describe('getItemsInfo', () => {
  test('overscans on both sides', () => {
    expect(renderedRange(500)).toEqual([45, 59]);
  });

  test('moves overscan that does not fit at the start to the end', () => {
    expect(renderedRange(0)).toEqual([0, 14]);
    expect(renderedRange(20)).toEqual([0, 14]);
  });

  test('moves overscan that does not fit at the end to the start', () => {
    expect(renderedRange(950)).toEqual([85, 99]);
  });
});
