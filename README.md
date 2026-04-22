# Zotero PDF Filters

A [Zotero](https://www.zotero.org/) plugin that adds **Brightness** and
**Contrast** sliders to the PDF reader's Appearance panel.

![Brightness and Contrast sliders in the Zotero PDF reader Appearance 
panel](example.png)

## Features

- Brightness slider (50–150%, step 5%)
- Contrast slider (80–360%, step 10%)
- Settings are saved per document and restored when you reopen it
- Default values are configurable in **Tools → Preferences → Plugins**

## Installation

Download the latest `.xpi` from [Releases](../../releases) and drag it onto the
Zotero window, or install via **Tools → Plugins → Install Plugin From File**.

## Development

Copy `.env.example` to `.env` and set `ZOTERO_PLUGIN_ZOTERO_BIN_PATH` and
`ZOTERO_PLUGIN_PROFILE_PATH`, then:

```bash
npm install
npm run dev     # hot-reload dev server
npm run build   # production build + type check
```

## Known Limitations

- This plugin only supports Zotero 7 and higher
- The contrast / brightness filters also affect annotations. Currently I'm
  unaware of any way to control this.
