const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const validAppEnvironments = new Set(['development', 'staging', 'production']);

module.exports = (_environment, argv) => {
  const appEnvironment = process.env.APP_ENV || (argv.mode === 'development' ? 'development' : 'production');
  const buildLabel = process.env.BUILD_LABEL || appEnvironment;
  const contentBuildId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const useFirebaseEmulators = process.env.USE_FIREBASE_EMULATORS === 'true';

  if (!validAppEnvironments.has(appEnvironment)) {
    throw new Error(`Invalid APP_ENV: ${appEnvironment}`);
  }
  if (useFirebaseEmulators && (argv.mode !== 'development' || appEnvironment !== 'development')) {
    throw new Error('Firebase emulators may only be enabled for a development build');
  }

  return {
    entry: {
      popup: './src/popup/index.tsx',
      offscreen: './src/offscreen/index.ts',
      content: './src/content/content.ts',
      'dashboard-extension-bridge': './src/content/dashboard-extension-bridge.ts',
      'linkedin-invite-network-hook': './src/content/linkedin-invite-network-hook.ts',
      'linkedin-analytics-network-hook': './src/content/linkedin-analytics-network-hook.ts',
      'profile-content': './src/content/profile-content/index.ts',
      'sharefeed-capture': './src/content/sharefeed-capture.ts',
      'feeds-sidebar': './src/content/feeds-sidebar/index.ts',
      background: './src/background/background.ts',
    },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      clean: true,
      publicPath: '',
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          use: {
            loader: 'ts-loader',
            options: {
              transpileOnly: true,
            },
          },
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
      ],
    },
    resolve: {
      extensions: ['.tsx', '.ts', '.js'],
      alias: {
        types: path.resolve(__dirname, 'src/types'),
        utils: path.resolve(__dirname, 'src/utils'),
        shared: path.resolve(__dirname, '../shared'),
      },
      modules: [path.resolve(__dirname, 'node_modules'), 'node_modules'],
    },
    resolveLoader: {
      modules: [path.resolve(__dirname, 'node_modules'), 'node_modules'],
    },
    plugins: [
      new webpack.DefinePlugin({
        __MFP_DEV_BUILD__: JSON.stringify(argv.mode === 'development'),
        __APP_ENV__: JSON.stringify(appEnvironment),
        __MFP_CONTENT_BUILD_ID__: JSON.stringify(contentBuildId),
        __USE_FIREBASE_EMULATORS__: JSON.stringify(useFirebaseEmulators),
      }),
      new HtmlWebpackPlugin({
        template: './src/popup/index.html',
        filename: 'popup.html',
        chunks: ['popup'],
      }),
      new HtmlWebpackPlugin({
        template: './src/offscreen/index.html',
        filename: 'offscreen.html',
        chunks: ['offscreen'],
      }),
      new CopyWebpackPlugin({
        patterns: [
          {
            from: 'src/manifest.json',
            to: 'manifest.json',
            transform(content) {
              const manifest = JSON.parse(content.toString());
              const environmentNames = {
                development: 'myFeedPilot Dev',
                staging: 'myFeedPilot Staging',
                production: 'myFeedPilot',
              };

              manifest.name = environmentNames[appEnvironment];
              manifest.version_name =
                appEnvironment === 'production' ? manifest.version : `${manifest.version}-${buildLabel}`.slice(0, 45);

              if (useFirebaseEmulators) {
                manifest.host_permissions = [...new Set([...(manifest.host_permissions || []), 'http://127.0.0.1/*'])];
              }

              return JSON.stringify(manifest, null, 2);
            },
          },
          { from: 'src/icons', to: 'icons', noErrorOnMissing: true },
        ],
      }),
    ],
    devtool: 'source-map',
  };
};
