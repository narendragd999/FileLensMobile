const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Ignore native build directories and temporary outputs to prevent Metro watcher crashes
config.resolver.blockList = [
  ...Array.from(config.resolver.blockList || []),
  /.*\/android\/app\/\.cxx\/.*/,
  /.*\/android\/\.cxx\/.*/,
  /.*\/android\/build\/.*/,
  /.*\/android\/app\/build\/.*/,
  /.*\/node_modules\/.*\/android\/build\/.*/,
  /.*\/node_modules\/.*\/ios\/build\/.*/,
  /.*\.gradle\/.*/,
];

module.exports = config;
