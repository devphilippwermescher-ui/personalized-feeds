const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: {
    popup: './src/popup/index.tsx',
    offscreen: './src/offscreen/index.ts',
    content: './src/content/content.ts',
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
};
