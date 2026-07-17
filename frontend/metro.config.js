const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Wire NativeWind's global stylesheet into the Metro bundler.
module.exports = withNativeWind(config, { input: './src/global.css' });
