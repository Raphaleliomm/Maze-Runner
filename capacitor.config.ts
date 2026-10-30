import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'de.mazerunner.game',
  appName: 'Maze-Runner',
  webDir: 'native-web',
  android: { useLegacyBridge: true },
  server: { url: 'https://maze-runner.raphaleliom.workers.dev', cleartext: false },
};

export default config;
