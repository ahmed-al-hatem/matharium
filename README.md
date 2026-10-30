# Matharium

Interactive math web app: graph functions and equations, solve, build geometric constructions, and plot in 3D. Dark scientific theme from the Matharium style guide (STIX Two Text, Space Grotesk, IBM Plex Sans Arabic, JetBrains Mono, Caveat), with an English/Arabic (RTL) interface.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # engine, SVG export and spreadsheet tests
npm run build    # production build in dist/
```

## Features
- **Graphing**: `f(x) = sin(x)`, `y = 2x + 1`, implicit curves `x^2 + y^2 = 9`, inequalities `y < x^2`, piecewise `x < 0 ? -x : x^2`, sliders created automatically for unknown letters (`a x^2 + b`), `f'(x)`.
- **Commands**: `Solve`, `Roots`, `Extremum`, `Intersect`, `Derivative` (symbolic), `Integral` (definite and shaded, or numeric antiderivative), `Tangent`, `Simplify`, `Expand`, systems `Solve(x + y = 3, x - y = 1)`.
- **Geometry**: tools and commands for points, segments, lines, rays, vectors, polygons, circles, midpoints, perpendicular/parallel lines, bisectors, intersections, tangents, distances and angles. Free points can be dragged and dependent objects update.
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
