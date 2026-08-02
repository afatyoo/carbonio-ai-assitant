# Browser support

Carbonio AI Assistant is built as a Carbonio Shell UI microfrontend and inherits the
active Carbonio light or dark theme. The release build targets the latest two major
versions of Chrome, Firefox, Edge, and Safari.

The layout has explicit narrow-pane behavior at 48 rem and 38 rem: header controls
wrap, suggestions switch to one column, message bubbles widen safely, and the composer
keeps a bounded margin. `prefers-reduced-motion` disables the shimmer animation and
slows the progress spinner.

Support requires the browser to support the Carbonio version installed by the
administrator. A browser outside Carbonio's own supported matrix is not made supported
by this addon declaration.

Before stable promotion, run the authenticated checks in `docs/uat-runbook.md` on at
least Chrome and Firefox, in both Carbonio themes and at desktop plus narrow widths.
The browser must trust the internal Carbonio certificate authority.
