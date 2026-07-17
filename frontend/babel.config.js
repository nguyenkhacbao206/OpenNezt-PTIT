module.exports = function (api) {
  api.cache(true);
  return {
    // Path aliases (@/*) are resolved by Metro from tsconfig.json "paths"
    // automatically on Expo SDK 50+, so no module-resolver plugin is needed.
    // babel-preset-expo (SDK 54) auto-injects the react-native-worklets plugin
    // required by Reanimated 4 / NativeWind.
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
  };
};
