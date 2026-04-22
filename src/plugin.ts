import pluginCss from './styles.scss';
import { createSlider, createSliderGroup, type SliderConfig } from './slider';
import { isPDFReader, waitForReader, waitForInternalReader } from './utils';
import { FILTERS, getFilter, filterPref, type FilterID } from './filters';
import { config, version as packageVersion } from '../package.json';

export interface PluginOptions {
  id: string;
  version: string;
  rootURI: string;
  stylesId?: string;
}

export class Plugin {
  readonly id: string;
  readonly stylesId: string;
  readonly version: string;
  readonly rootURI: string;

  // filterId -> (itemKey -> value)
  #filterValues: Map<FilterID, Map<string, number>> = new Map();
  // filterId -> default value
  #defaultValues: Map<FilterID, number> = new Map();
  #appearanceObservers = new Map<string, MutationObserver>();

  getFilterValue(
    reader: _ZoteroTypes.ReaderInstance,
    filterId: FilterID,
  ): number {
    const enabledValue = this.isFilterEnabled(filterId)
      ? this.#filterValues.get(filterId)?.get(reader._item.key)
      : undefined;
    return (
      enabledValue ??
      this.#defaultValues.get(filterId) ??
      getFilter(filterId).neutral
    );
  }

  setFilterValue(
    reader: _ZoteroTypes.ReaderInstance,
    filterId: FilterID,
    value: number,
  ): void {
    const defaultVal =
      this.#defaultValues.get(filterId) ?? getFilter(filterId).neutral;
    const itemKey = reader._item.key;
    let filterValues = this.#filterValues.get(filterId);
    if (!filterValues) {
      filterValues = new Map();
      this.#filterValues.set(filterId, filterValues);
    }
    if (value === defaultVal) {
      filterValues.delete(itemKey);
    } else {
      filterValues.set(itemKey, value);
    }
  }

  isFilterEnabled(filterId: FilterID): boolean {
    const pref = Zotero.Prefs.get(filterPref(filterId, 'enabled'), true);
    return typeof pref === 'boolean'
      ? pref
      : getFilter(filterId).enabledByDefault;
  }

  getSavedValues(prefsKey: string): Map<string, number> | null {
    try {
      const raw = Zotero.Prefs.get(prefsKey, true);
      if (typeof raw === 'string') {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === 'object') {
          return new Map(Object.entries(parsed as Record<string, number>));
        }
      }
    } catch (e) {
      this.log(`error retrieving saved pref ${prefsKey}: ${e}`);
    }
    return null;
  }

  saveFilterValues(): void {
    for (const filter of FILTERS) {
      const values = this.#filterValues.get(filter.id);
      if (values) {
        const serialized = JSON.stringify(Object.fromEntries(values));
        Zotero.Prefs.set(filterPref(filter.id, 'values'), serialized);
      }
    }
  }

  constructor({
    id = config.addonID,
    stylesId = `${config.addonRef}__pluginStyles`,
    version = packageVersion,
    rootURI,
  }: PluginOptions) {
    this.id = id;
    this.stylesId = stylesId;
    this.version = version;
    this.rootURI = rootURI;
  }

  #toolbarEventHandler?: _ZoteroTypes.Reader.EventHandler<'renderToolbar'>;

  async startup(): Promise<void> {
    for (const filter of FILTERS) {
      const raw = Zotero.Prefs.get(filterPref(filter.id, 'default'), true);
      this.#defaultValues.set(
        filter.id,
        typeof raw === 'number' ? raw : filter.neutral,
      );
      const saved = this.getSavedValues(filterPref(filter.id, 'values'));
      this.#filterValues.set(filter.id, saved ?? new Map());
    }
    this.#registerToolbarListener();
    await this.styleExistingTabs();
  }

  shutdown(): void {
    this.saveFilterValues();
    this.#unregisterToolbarListener();
    for (const observer of this.#appearanceObservers.values()) {
      observer.disconnect();
    }
    this.#appearanceObservers.clear();
  }

  #registerToolbarListener() {
    this.#toolbarEventHandler = async ({ reader, doc }) => {
      this.log(
        `renderToolbar fired: tabID=${reader.tabID} doc.URL=${doc.URL} body=${!!doc.body}`,
      );
      if (!isPDFReader(reader)) return;
      await this.attachStylesToReader(reader);
    };
    Zotero.Reader.registerEventListener(
      'renderToolbar',
      this.#toolbarEventHandler,
      this.id,
    );
  }

  #unregisterToolbarListener() {
    if (this.#toolbarEventHandler) {
      Zotero.Reader.unregisterEventListener(
        'renderToolbar',
        this.#toolbarEventHandler,
      );
      this.#toolbarEventHandler = undefined;
    }
  }

  async attachStylesToReader(reader: _ZoteroTypes.ReaderInstance<'pdf'>) {
    await waitForReader(reader);
    await waitForInternalReader(reader);

    this.applyFilters(reader);
    this.addSliders(reader);

    this.log(`attachStylesToReader: tabID=${reader.tabID}`);
  }

  applyFilters(reader: _ZoteroTypes.ReaderInstance<'pdf'>): void {
    const pdfDoc: Document | undefined =
      reader._internalReader._primaryView._iframeWindow?.document;
    if (!pdfDoc || !pdfDoc.documentElement) {
      this.log(`applyFilters: tab ${reader.tabID} not ready`);
      return;
    }

    const root = (pdfDoc.documentElement as HTMLElement | null) || pdfDoc.body;
    if (!root) return;

    const allNeutral = FILTERS.every(
      (f) => this.getFilterValue(reader, f.id) === f.neutral,
    );

    if (allNeutral) {
      pdfDoc.getElementById(this.stylesId)?.remove();
      for (const filter of FILTERS) {
        root.style.removeProperty(filter.cssVar);
      }
    } else {
      if (!pdfDoc.getElementById(this.stylesId)) {
        const styles = pdfDoc.createElement('style');
        styles.id = this.stylesId;
        styles.innerText = pluginCss;
        pdfDoc.documentElement.appendChild(styles);
      }
      for (const filter of FILTERS) {
        const value = this.getFilterValue(reader, filter.id);
        if (value !== filter.neutral) {
          root.style.setProperty(filter.cssVar, `${value}${filter.unit}`);
        } else {
          root.style.removeProperty(filter.cssVar);
        }
      }
    }
  }

  /** Add sliders to the appearance panel when it is opened. */
  addSliders(reader: _ZoteroTypes.ReaderInstance<'pdf'>) {
    const tabID = reader.tabID;
    this.#appearanceObservers.get(tabID)?.disconnect();

    const doc = reader._iframeWindow?.document;
    const iframeWindow = doc?.defaultView;
    if (!doc || !iframeWindow) {
      this.log(`addSliders: no document for tabID=${tabID}`);
      return;
    }

    const observeRoot = doc.getElementById('reader-ui');
    if (!observeRoot) {
      this.log(`addSliders: no reader-ui for tabID=${tabID}, URL=${doc.URL}`);
      return;
    }

    const onOpenAppearancePanel = (appearancePanel: AppearancePanel): void => {
      this.log('opened appearance panel');
      const groupDataAttr = 'pdf-sliders';
      if (appearancePanel.querySelector(`[data-${groupDataAttr}]`)) {
        return;
      }

      const group = createSliderGroup(doc, groupDataAttr);
      for (const filter of FILTERS.filter((f) => this.isFilterEnabled(f.id))) {
        const sliderConfig: SliderConfig = {
          ...filter.slider,
          dataAttr: `${filter.id}-slider`,
          inputId: `${filter.id}-slider`,
          unit: filter.unit,
        };
        group.appendChild(
          createSlider(
            doc,
            this.getFilterValue(reader, filter.id),
            (value) => {
              this.setFilterValue(reader, filter.id, value);
              this.applyFilters(reader);
            },
            sliderConfig,
          ),
        );
      }

      appearancePanel.prepend(group);
    };

    const onCloseAppearancePanel = (): void => {
      this.log('closed appearance panel');
      this.saveFilterValues();
    };

    const observer = new iframeWindow.MutationObserver(
      (mutations: MutationRecord[]) => {
        for (const mutation of mutations) {
          for (const node of mutation.removedNodes) {
            const popup = getAppearancePanel(node);
            if (popup) {
              onCloseAppearancePanel();
            }
          }
          for (const node of mutation.addedNodes) {
            const popup = getAppearancePanel(node);
            if (popup) {
              onOpenAppearancePanel(popup);
            }
          }
        }
      },
    );

    observer.observe(observeRoot, { childList: true, subtree: false });
    this.#appearanceObservers.set(tabID, observer);
    this.log(`addSliders: observer active for tabID=${tabID}`);
  }

  async styleExistingTabs() {
    this.log('adding styles to existing tabs');
    const readers = Zotero.Reader._readers;
    this.log(
      `found ${readers.length} reader tags: ${readers.map((r) => r.tabID).join(', ')}`,
    );
    await Promise.all(
      readers.map((r) => isPDFReader(r) && this.attachStylesToReader(r)),
    );
    this.log('done adding styles to existing tabs');
  }

  log(
    msg: string,
    type: 'error' | 'warning' | 'exception' | 'strict' = 'warning',
  ) {
    Zotero.log(`[${config.addonName}] ${msg}`, type);
  }
}

type AppearancePanel = Element;

function getAppearancePanel(node: Node | null): AppearancePanel | null {
  if (node?.nodeType !== 1) return null;
  const elem = node as Element;
  return elem.classList.contains('appearance-popup')
    ? elem
    : elem.querySelector('.appearance-popup');
}
