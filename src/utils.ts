export const isPDFReader = (
  r: _ZoteroTypes.ReaderInstance,
): r is _ZoteroTypes.ReaderInstance<'pdf'> => r.type === 'pdf';

export const isEpubReader = (
  r: _ZoteroTypes.ReaderInstance,
): r is _ZoteroTypes.ReaderInstance<'epub'> => r.type === 'epub';

export const isSnapshotReader = (
  r: _ZoteroTypes.ReaderInstance,
): r is _ZoteroTypes.ReaderInstance<'snapshot'> => r.type === 'snapshot';

export const isIframe = (e: Element): e is HTMLIFrameElement =>
  e.tagName.toUpperCase() === 'IFRAME';
