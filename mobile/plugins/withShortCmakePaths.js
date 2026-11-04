const { withAppBuildGradle } = require('expo/config-plugins');

// Ninja on Windows can reject long object paths even when the source path is valid.
// Keep this in CNG configuration so regenerating android preserves the workaround.
module.exports = function withShortCmakePaths(config) {
  return withAppBuildGradle(config, config => {
    if (config.modResults.language !== 'groovy') throw new Error('Expected Groovy app build.gradle');
    const marker = '// SavePiggy: shorten CMake object paths';
    if (!config.modResults.contents.includes(marker)) {
      config.modResults.contents += `\n${marker}\nandroid.externalNativeBuild.cmake.buildStagingDirectory = rootProject.file("../../.cxx")\nandroid.defaultConfig.externalNativeBuild.cmake.arguments.add("-DCMAKE_OBJECT_PATH_MAX=250")\n`;
    }
    return config;
  });
};
