const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// lucide-react-native ships ESM `.mjs` icon files behind the package "exports"
// field. Metro's dev server needs both flags to resolve them, otherwise it
// fails with: Unable to resolve "./icons/*.mjs".
config.resolver.unstable_enablePackageExports = true;
if (!config.resolver.sourceExts.includes('mjs')) {
  config.resolver.sourceExts.push('mjs');
}

// Wire NativeWind's global stylesheet into the Metro bundler.
module.exports = withNativeWind(config, { input: './src/global.css' });
