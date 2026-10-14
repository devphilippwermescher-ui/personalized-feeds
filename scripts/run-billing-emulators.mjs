import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { delimiter, resolve } from 'node:path';

const localJavaHome = resolve('.local-tools/temurin-21/Contents/Home');
const environment = {
  ...process.env,
  FIREBASE_CLI_DISABLE_UPDATE_CHECK: 'true',
};

if (existsSync(resolve(localJavaHome, 'bin/java'))) {
  environment.JAVA_HOME = localJavaHome;
  environment.PATH = `${resolve(localJavaHome, 'bin')}${delimiter}${environment.PATH || ''}`;
}

const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const child = spawn(
  executable,
  [
    '--yes',
    'firebase-tools@15.28.2',
    'emulators:start',
    '--only',
    'auth,firestore,functions',
    '--project',
    'development',
  ],
  {
    cwd: process.cwd(),
    env: environment,
    stdio: 'inherit',
  }
);

child.on('error', (error) => {
  console.error(`Unable to start Firebase emulators: ${error.message}`);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
