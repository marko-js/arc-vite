<h1 align="center">
  <!-- Logo -->
  <br/>
  arc-vite
	<br/>

  <!-- Language -->
  <a href="http://typescriptlang.org">
    <img src="https://img.shields.io/badge/%3C%2F%3E-typescript-blue.svg" alt="TypeScript"/>
  </a>
  <!-- Format -->
  <a href="https://github.com/prettier/prettier">
    <img src="https://img.shields.io/badge/styled_with-prettier-ff69b4.svg" alt="Styled with prettier"/>
  </a>
  <!-- CI -->
  <a href="https://github.com/marko-js/arc-vite/actions/workflows/ci.yml">
    <img src="https://github.com/marko-js/arc-vite/actions/workflows/ci.yml/badge.svg" alt="Build status"/>
  </a>
  <!-- Coverage -->
  <a href="https://codecov.io/gh/marko-js/arc-vite">
    <img src="https://codecov.io/gh/marko-js/arc-vite/branch/main/graph/badge.svg?token=TODO"/>
  </a>
  <!-- NPM Version -->
  <a href="https://npmjs.org/package/arc-vite">
    <img src="https://img.shields.io/npm/v/arc-vite.svg" alt="NPM Version"/>
  </a>
  <!-- Downloads -->
  <a href="https://npmjs.org/package/arc-vite">
    <img src="https://img.shields.io/npm/dm/arc-vite.svg" alt="Downloads"/>
  </a>
</h1>

Declaratively bundle and execute code specific to your users using [ARC](https://github.com/ebay/arc) and [Vite](https://vitejs.dev).

# Installation

```console
npm install arc-vite
```

# Configuration

The only required configuration for `arc-vite` is the `flags` or `flagSets` option. These limit the number of possible flag permutations and allow `arc-vite` to optimally bundle your app.

## Example vite.config.ts

```javascript
import { defineConfig } from "vite";
import arcPlugin from "arc-vite";

export default defineConfig({
  plugins: [arcPlugin({ flags: ["mobile"] })],
});
```

### options.flags: (string | string[])[]

An array where each element is either a `string` or `string[]`. Each string represents an individual flag, and each array of strings represents a group of flags that can be combined. When a `string[]` is provided as an item any combination of those flags will become valid. Note that an empty flag combination (the default flags) is always output.

Eg `flags: ["legacy", ["tablet", "desktop"]]` will yield the following exploded flag sets:

```js
[
  [], // the empty flag set
  ["legacy"],
  ["tablet"],
  ["tablet", "legacy"],
  ["desktop"],
  ["desktop", "legacy"],
];
```

### options.flagSets: string[][]

An array of all possible flag combinations. This is lower level than [`options.flags`](#optionsflags-string--string) and allows you to have complete control over the possible flag combinations. The empty flag set is still required automatically added for you.

Note that `arc-vite` also exposes a `createFlagSets` method to create flag combinations similar to [`options.flags`](#optionsflags-string--string) and a `hasFlags` method to filter the flag sets down. This can be useful to create flag combinations and then filter down unnecessary ones.

Eg lets say that in the above we want to ensure that the `tablet` flag will never be paired with the `legacy` flag. Using this helpers and the `options.flagSets` we could achieve that with the following example:

```js
import { defineConfig } from "vite";
import arcVite, { createFlagSets, hasFlags } from "arc-vite";

export default defineConfig({
  plugins: [
    arcVite({
      // The below will filter out all flagSets which have `tablet` and `legacy`.
      // In this case that means `["tablet", "legacy"]` and `["tablet", "legacy", "experiment"]` will be removed.
      flagSets: createFlagSets([
        "legacy",
        "experiment",
        ["tablet", "desktop"],
      ]).filter((flagSet) => hasFlags(flagSet, ["tablet", "legacy"])),
    }),
  ],
});
```

### options.runtimeId?: string

For inter chunk communication `arc-vite` uses a global variable in the browser.
To avoid conflicts with multiple copies of `arc-vite` prepared assets loaded into a single page you can provide a valid javascript identifier as a string to use as the global.

# Setting arc flags.

## Development

In development `arc-vite` does not _currently_ support runtime adaptive flags.
Instead you can configure the current flags to use by setting the `FLAGS` environment variable with dot (`.`) separated flags.

Eg when running your vite server

```console
FLAGS=mobile node ./my-server.js
```

## Production

Setting arc flags for production is the same as other implementations of arc. Use arc-server's [`setFlags` api](https://github.com/eBay/arc/tree/master/packages/arc-server#setflags).
Below is an example of a simple http server that exposes `mobile` arc flag based on the user agent.

```javascript
import https from "https"
import { setFlags } from "arc-server"

https.createServer(..., (req, res) => {
  setFlags({
    mobile: req.getHeader("Sec-CH-UA-Mobile") === "?1"
  });

  // run app code
}).listen(8443);
```

> **Note:**
> Setting `process.env.FLAGS` (as described in the [settings flags for development section](#development)) will also work for production builds.
> When set, the actual flags passed to `setFlags` or `withFlags` are ignored and instead the `process.env.FLAGS` are passed.
> This can be useful to force a flag set to be used in preview environments.

# Reading browser assets

If you are using [Marko](http://markojs.com) then the following is **not necessary** since this plugin will communicate with the Marko compiler in order to automatically inline the appropriate assets.

For other types of setups this plugin exposes another top level api on `arc-server` called `getAssets`. This method will return an object with html to inject into your application given the _currently set_ arc flags.

```javascript
import { getAssets } from "arc-server";
export function handleRequest(req, res) {
  const assets = getAssets("index"); // get all assets for the `index` (default) entry into vite.
  res.end(`
<!DOCTYPE html>
<html lang="en">
<head>
  ${assets["head-prepend"] || ""}
  <!-- ... -->
  ${assets.head || ""}
</head>
<body>
  ${assets["body-prepend"] || ""}
  <!-- ... -->
  ${assets.body || ""}
</body>
</html>
  `);
}
```

# Code of Conduct

This project adheres to the [eBay Code of Conduct](./.github/CODE_OF_CONDUCT.md). By participating in this project you agree to abide by its terms.
