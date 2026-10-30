# Matharium

Interactive math web app: graph functions and equations, solve, build geometric constructions, and plot in 3D. Dark scientific theme from the Matharium style guide (STIX Two Text, Space Grotesk, IBM Plex Sans Arabic, JetBrains Mono, Caveat), with an English/Arabic (RTL) interface.

**Live app:** https://ahmed-al-hatem.github.io/matharium/

## Install as an app
Matharium is a Progressive Web App and works offline after the first visit.
- **Chrome / Edge (Windows, macOS, Linux, Android):** use the install icon in the address bar or Menu → *Install app* inside Matharium. The installed app opens `.mth` project files directly.
- **iPhone / iPad (Safari):** Share → *Add to Home Screen*.

Updates download in the background; a *Reload* banner appears when a new version is ready.

## Development
```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (vitest)
npm run e2e      # Playwright: desktop, mobile and offline PWA checks
npm run build    # production build in dist/
```

## Features
- **Graphing**: `f(x) = sin(x)`, `y = 2x + 1`, implicit curves `x^2 + y^2 = 9`, inequalities `y < x^2`, piecewise `x < 0 ? -x : x^2`, sliders created automatically for unknown letters (`a x^2 + b`), `f'(x)`.
- **Commands**: `Solve`, `Roots`, `Extremum`, `Intersect`, `Derivative` (symbolic), `Integral` (definite and shaded, or numeric antiderivative), `Tangent`, `Simplify`, `Expand`, systems `Solve(x + y = 3, x - y = 1)`.
- **Worked solutions**: a *Steps* button under `Solve`, `Derivative` and `Factor` results, or the `Steps(…)` command, explains the solution line by line in English or Arabic: linear equations, quadratics (Δ, factoring or the formula), polynomials with rational roots (synthetic division), 2×2 linear systems, and derivatives with each rule named.
- **Calculus**: `RiemannSum(f, a, b, n, "mid")` with drawn strips, `SlopeField(x - y)`, `SolveODE(f(x, y), A)` (RK4, follows a draggable point), `TaylorPolynomial(f, a, n)`, `IntegralBetween(f, g, a, b)`.
- **Statistics**: `Mean`, `Median`, `SD`, `Histogram`, `BoxPlot` on lists `{…}` or spreadsheet ranges `A1:A20`; `Normal(μ, σ, a, b)` and `Binomial(n, p, a, b)` with the probability shaded.
- **Input autocomplete**: matching commands with their argument signatures (English/Arabic) and object names; Tab/Enter inserts and selects the first argument, Tab moves to the next. The same command table generates the Help dialog.
- **Geometry**: tools and commands for points, segments, lines, rays, vectors, polygons, circles, midpoints, perpendicular/parallel lines, bisectors, intersections, tangents, distances and angles. Free points can be dragged and dependent objects update. `Point(c)` (or the *Point on object* tool) makes a point that slides along a curve, circle, line or polygon, and `Locus(Q, P)` traces a dependent point.
- **Polar**: curves `r = 2 sin(3θ)` (θ range chosen automatically, e.g. a spiral `r = θ` runs to 6π), polar points `(3; 45°)` and `(2; π/3)`, and the *Polar* grid type (2D, and the z = 0 plane in 3D).
- **Regression**: `FitLine`, `FitPoly(list, n)` (QR least squares), `FitExp`, `FitLog`, `FitPow` (linearized, then refined with Gauss–Newton) and `FitSin`, on a list of points or its name, with R². The spreadsheet's *Regression line* menu offers every type.
- **Animation**: per-slider speed (×0.25–×4) and mode (back and forth, increasing, once), *Play all* / *Stop all*, traces for moving points, and video recording of the 2D or 3D view to `.webm` (offline, `canvas.captureStream` + `MediaRecorder`), stopping after one cycle. A whole animation is one undo step.
- **3D**: surfaces `z = f(x, y)`, implicit surfaces (`x^2 + y^2 + z^2 = 9`), planes, points, vectors, `Curve`, parametric `Surface`, `Sphere`.
- **Table & spreadsheet**: a table of function values, and a spreadsheet with A1 formulas (`=sum(A1:A5)`, `=f(B2)`). You can plot the A/B columns as points or fit a regression line.
- **Files**: New, Open (`.mth`/`.json` projects, `.csv` into the spreadsheet), Save, Save as (File System Access API, with a download fallback), Export PNG/SVG/CSV, a share link, and autosave.
- Undo/redo, the on-screen math keyboard, keyboard shortcuts (Ctrl+Z/Y/S/Shift+S/O, Delete, Esc), and a responsive layout.

## Structure
- `src/math`: the parser, the expression compiler (mathjs → fast JS), the evaluation engine, solvers and geometry
- `src/graph2d`: the canvas renderer, marching squares, hit testing and the SVG context
- `src/graph3d`: the three.js scene and meshes
- `src/components`: the UI panels, the keyboard and dialogs
- `src/store`: the project state (zustand)
- `src/io`: save/open/export
