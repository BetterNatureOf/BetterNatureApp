const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Firebase Auth's native entry registers with the CommonJS app registry.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const nativeFirebaseApp = platform !== 'web' && moduleName === '@firebase/app';
  return context.resolveRequest(
    nativeFirebaseApp ? { ...context, isESMImport: false } : context,
    moduleName,
    platform,
  );
};

module.exports = config;
