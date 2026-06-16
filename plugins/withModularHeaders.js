const { withDangerousMod } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

/**
 * Adds `use_modular_headers!` to the Podfile so that Swift pods like AppCheckCore
 * (a transitive dependency of @react-native-google-signin/google-signin v16) can
 * import ObjC pods (GoogleUtilities, RecaptchaInterop) that don't define modules.
 */
module.exports = function withModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf-8');
      if (!contents.includes('use_modular_headers!')) {
        contents = contents.replace(
          /^(platform :ios.*)/m,
          '$1\nuse_modular_headers!'
        );
        fs.writeFileSync(podfilePath, contents);
      }
      return config;
    },
  ]);
};
