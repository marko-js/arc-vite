import type * as vite from "vite";
const arcVitePluginNameReg = /^arc-vite/;
export function ensureArcPluginIsFirst(plugins: vite.PluginOption[]) {
  for (let i = plugins.length; i--; ) {
    const plugin = plugins[i];
    if (!Array.isArray(plugin)) continue;
    const [firstPlugin] = plugin;
    if (
      firstPlugin &&
      typeof firstPlugin === "object" &&
      "name" in firstPlugin &&
      arcVitePluginNameReg.test(firstPlugin.name)
    ) {
      plugins[i] = false;
      plugins.unshift(plugin);
    }
  }
}
