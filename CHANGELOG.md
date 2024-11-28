# Changelog

## 1.2.5

### Patch Changes

- [#18](https://github.com/marko-js/arc-vite/pull/18) [`2b2c502`](https://github.com/marko-js/arc-vite/commit/2b2c50291ceb5cbe2afaf3e006e3cf4a6b35eec8) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Bump Vite peer dependency.

## 1.2.4

### Patch Changes

- [#15](https://github.com/marko-js/arc-vite/pull/15) [`980ebbc`](https://github.com/marko-js/arc-vite/commit/980ebbcae63e98b6daff9f72a131e9d6352a8eb2) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Fix syntax error in generated code when multiple arc conditions used.

## 1.2.3

### Patch Changes

- [#13](https://github.com/marko-js/arc-vite/pull/13) [`c82db74`](https://github.com/marko-js/arc-vite/commit/c82db74446af0b36ec64d193643ae0ab7fca25c4) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Reverts virtual adaptive module support for now since it was not properly working and dramatically increased the complexity of this module and caused a few regressions that were difficult to resolve.

## 1.2.2

### Patch Changes

- [#11](https://github.com/marko-js/arc-vite/pull/11) [`419b1df`](https://github.com/marko-js/arc-vite/commit/419b1df8cc1fd7972b5cb536fc0beb100a9e2e99) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Fix support for renderBuiltURL vite api

## 1.2.1

### Patch Changes

- [#9](https://github.com/marko-js/arc-vite/pull/9) [`74a55b6`](https://github.com/marko-js/arc-vite/commit/74a55b604a476952e83f6d9f1dea66fa774b4422) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Use inline script to load adaptive assets in correct order instead of appending to chunk file.

## 1.2.0

### Minor Changes

- [#7](https://github.com/marko-js/arc-vite/pull/7) [`1472478`](https://github.com/marko-js/arc-vite/commit/14724786236fc0373eb13bc164eaa059b99a3f18) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Move away from top level await which has limited browser support.

### Patch Changes

- [#7](https://github.com/marko-js/arc-vite/pull/7) [`161b0c1`](https://github.com/marko-js/arc-vite/commit/161b0c14ea8dc1349a9b6461b29d424eee7ffb25) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Avoid using `this.load` unless the ast has not already been parsed for a module.

- [#7](https://github.com/marko-js/arc-vite/pull/7) [`798c045`](https://github.com/marko-js/arc-vite/commit/798c045de06c2bec2c7706ca029d11371746ebd6) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Avoid checking for virtual adaptive modules when processing files known to be handled by Vite.

## 1.1.0

### Minor Changes

- [#5](https://github.com/marko-js/arc-vite/pull/5) [`2625f47`](https://github.com/marko-js/arc-vite/commit/2625f47556f8433f95a01a908cd482dbc1229e40) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Add support for other Vite plugins registering additional files to check when determining if a module is adaptive.

## 1.0.2

### Patch Changes

- [#3](https://github.com/marko-js/arc-vite/pull/3) [`1220c98`](https://github.com/marko-js/arc-vite/commit/1220c98ca71d8bc941ca7cce42aa291f7c5a33f3) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Ensure arc plugin always runs first.

## 1.0.1

### Patch Changes

- [#1](https://github.com/marko-js/arc-vite/pull/1) [`e295c47`](https://github.com/marko-js/arc-vite/commit/e295c4720df3cd7a6e9e2bde61862857a3eff01e) Thanks [@DylanPiercey](https://github.com/DylanPiercey)! - Fix issue when there are multiple flags.

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.
