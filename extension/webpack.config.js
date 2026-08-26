const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const appEnvironment = process.env.APP_ENV || 'production';
const validAppEnvironments = new Set(['development', 'staging', 'production']);

if (!validAppEnvironments.has(appEnvironment)) {
  throw new Error(`Invalid APP_ENV: ${appEnvironment}`);
}

module.exports = (_environment, argv) => ({
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
        { from: 'src/manifest.json', to: 'manifest.json' },
        { from: 'src/icons', to: 'icons', noErrorOnMissing: true },
      ],
    }),
  ],
  devtool: 'source-map',
});
