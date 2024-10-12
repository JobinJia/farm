import { CompilationMode } from '../../config/env';
import {
  type JsPlugin,
  type UserConfig,
  normalizeDevServerConfig
} from '../../index';
import merge from '../../utils/merge';
import { resolveAsyncPlugins } from '../index';
import { cssPluginUnwrap, cssPluginWrap } from './adapter-plugins/css';
import { defaultLoadPlugin } from './adapter-plugins/default-load';
import { DEFAULT_FILTERS, normalizeFilterPath } from './utils';
import { VitePluginAdapter } from './vite-plugin-adapter';

// export * from './jsPluginAdapter.js';
export { VitePluginAdapter } from './vite-plugin-adapter';

type VitePluginType = object | (() => { vitePlugin: any; filters: string[] });
type VitePluginsType = VitePluginType[];

export async function handleVitePlugins(
  vitePlugins: VitePluginsType,
  userConfig: UserConfig,
  mode: CompilationMode
): Promise<JsPlugin[]> {
  const jsPlugins: JsPlugin[] = [];
  const filtersUnion = new Set<string>();

  if (vitePlugins.length) {
    userConfig = merge({}, userConfig, {
      compilation: userConfig.compilation,
      server: normalizeDevServerConfig(
        userConfig.server,
        userConfig.compilation?.mode ?? mode
      )
    });
  }
  const flatVitePlugins = await resolveAsyncPlugins(vitePlugins);

  for (const vitePluginObj of flatVitePlugins) {
    let vitePlugin = vitePluginObj,
      filters = DEFAULT_FILTERS;

    if (typeof vitePluginObj === 'function') {
      const { vitePlugin: plugin, filters: f } = vitePluginObj();
      vitePlugin = plugin;
      filters = f;
    }
    filters?.forEach((filter) => filtersUnion.add(filter));
    processVitePlugin(vitePlugin, userConfig, filters, jsPlugins, mode);
  }

  // if vitePlugins is not empty, append a load plugin to load file
  // this plugin is only for compatibility
  if (vitePlugins.length) {
    jsPlugins.push(
      defaultLoadPlugin({
        filtersUnion,
        userConfig
      })
    );
    jsPlugins.unshift(cssPluginWrap({ filtersUnion }));
    jsPlugins.push(cssPluginUnwrap({ filtersUnion }));
  }

  return jsPlugins;
}

export function processVitePlugin(
  vitePlugin: VitePluginType,
  userConfig: UserConfig,
  filters: string[],
  jsPlugins: JsPlugin[],
  mode: CompilationMode
) {
  const processPlugin = (plugin: any) => {
    const vitePluginAdapter = new VitePluginAdapter(
      plugin as any,
      userConfig,
      filters,
      mode
    );
    convertPlugin(vitePluginAdapter);
    jsPlugins.push(vitePluginAdapter);
  };

  if (Array.isArray(vitePlugin)) {
    vitePlugin.forEach((plugin) => processPlugin(plugin));
  } else {
    processPlugin(vitePlugin);
  }
}

export function convertPlugin(plugin: JsPlugin): void {
  if (
    plugin.transform &&
    !plugin.transform.filters?.moduleTypes &&
    !plugin.transform.filters?.resolvedPaths
  ) {
    throw new Error(
      `transform hook of plugin ${plugin.name} must have at least one filter(like moduleTypes or resolvedPaths)`
    );
  }
  if (plugin.transform) {
    if (!plugin.transform.filters.moduleTypes) {
      plugin.transform.filters.moduleTypes = [];
    } else if (!plugin.transform.filters.resolvedPaths) {
      plugin.transform.filters.resolvedPaths = [];
    }
  }

  if (plugin.renderResourcePot) {
    plugin.renderResourcePot.filters ??= {};

    if (
      !plugin.renderResourcePot?.filters?.moduleIds &&
      !plugin.renderResourcePot?.filters?.resourcePotTypes
    ) {
      throw new Error(
        `renderResourcePot hook of plugin ${plugin.name} must have at least one filter(like moduleIds or resourcePotTypes)`
      );
    }

    if (!plugin.renderResourcePot.filters?.resourcePotTypes) {
      plugin.renderResourcePot.filters.resourcePotTypes = [];
    } else if (!plugin.renderResourcePot.filters?.moduleIds) {
      plugin.renderResourcePot.filters.moduleIds = [];
    }
  }

  if (plugin.augmentResourceHash) {
    plugin.augmentResourceHash.filters ??= {};

    if (
      !plugin.augmentResourceHash?.filters?.moduleIds &&
      !plugin.augmentResourceHash?.filters?.resourcePotTypes
    ) {
      throw new Error(
        `augmentResourceHash hook of plugin ${plugin.name} must have at least one filter(like moduleIds or resourcePotTypes)`
      );
    }

    if (!plugin.augmentResourceHash.filters?.resourcePotTypes) {
      plugin.augmentResourceHash.filters.resourcePotTypes = [];
    } else if (!plugin.augmentResourceHash.filters?.moduleIds) {
      plugin.augmentResourceHash.filters.moduleIds = [];
    }
  }

  if (plugin.resolve?.filters?.importers?.length) {
    plugin.resolve.filters.importers =
      plugin.resolve.filters.importers.map(normalizeFilterPath);
  }

  if (plugin.load?.filters?.resolvedPaths?.length) {
    plugin.load.filters.resolvedPaths =
      plugin.load.filters.resolvedPaths.map(normalizeFilterPath);
  }

  if (plugin.transform?.filters?.resolvedPaths?.length) {
    plugin.transform.filters.resolvedPaths =
      plugin.transform.filters.resolvedPaths.map(normalizeFilterPath);
  }
  if (plugin.augmentResourceHash?.filters?.moduleIds) {
    plugin.augmentResourceHash.filters.moduleIds =
      plugin.augmentResourceHash.filters.moduleIds.map(normalizeFilterPath);
  }

  if (plugin.renderResourcePot?.filters?.moduleIds) {
    plugin.renderResourcePot.filters.moduleIds =
      plugin.renderResourcePot.filters.moduleIds.map(normalizeFilterPath);
  }
}
