import { LongCatAuthPlugin } from "./src/provider.mjs";

/**
 * The plugin entry.
 *
 * OpenCode loads `exports["./server"]` first, then `main`, then `exports["."]`,
 * and treats every exported function as a plugin. This file exports exactly one
 * function plus the `{ id, server }` form, and nothing else: a helper function
 * exported from here would be loaded as a second plugin.
 */
export default { id: "opencode-longcat-auth", server: LongCatAuthPlugin };
