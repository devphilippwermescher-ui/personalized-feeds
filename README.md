# myFeedPilot

[![Latest Release](https://img.shields.io/github/v/release/devphilippwermescher-ui/linkedin-feed-sorter)](https://github.com/devphilippwermescher-ui/linkedin-feed-sorter/releases/latest)

Chrome extension for analyzing and sorting LinkedIn feed posts by engagement metrics (likes, comments, shares).

## Features

- 🔍 Automatic data collection from LinkedIn feed
- 📊 Metrics analysis: likes, comments, shares
- 🔄 Sort posts by various criteria:
  - By number of likes
  - By number of comments
  - By number of shares
  - By total engagement score (likes + comments×2 + shares×3)
- 📈 Display statistics in a convenient interface
- 🎯 Sponsored posts indication
- 🏷️ Hashtag display
- 🚀 Quick navigation to LinkedIn feed from any page

## Installation

### Option 1: Download Pre-built Extension (Recommended)

1. Go to the [Releases page](../../releases/latest)
2. Download `linkedin-feed-sorter.zip`
3. Extract the ZIP file to a folder
4. Open Chrome and navigate to `chrome://extensions/`
5. Enable "Developer mode" in the top right corner
6. Click "Load unpacked"
7. Select the extracted folder

### Option 2: Build from Source

#### Step 1: Install dependencies

```bash
npm install
```

#### Step 2: Build the extension

```bash
npm run build
```

#### Step 3: Load into Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right corner
3. Click "Load unpacked"
4. Select the `dist` folder from the project

## Development

For development with automatic rebuild on changes:

```bash
npm run dev
```

After making changes, reload the extension in `chrome://extensions/`.

## Usage

### From any page

1. Click the extension icon in Chrome toolbar
2. Click "Go to LinkedIn Feed" button to navigate to your feed

### On LinkedIn Feed

1. Open the extension via the icon in Chrome toolbar
2. Scroll through your feed to collect posts
3. Use sorting buttons to organize posts by metrics:
   - **Default** - default order (as received)
   - **Most Likes** - by number of likes
   - **Most Comments** - by number of comments
   - **Most Shares** - by number of shares
   - **Engagement** - by total engagement score
4. Click "Clear" to clear collected data

## Technologies

- **React 18** - UI library
- **TypeScript** - typed JavaScript
- **Webpack** - module bundler
- **Chrome Extension Manifest V3** - latest extension API version

## Project Structure

```
linkedin-analyzer/
├── src/
│   ├── background/          # Background service worker
│   │   └── background.ts    # Data processing from content script
│   ├── content/             # Content script
│   │   └── content.ts       # Message bridge to background
│   ├── injected/            # Injected script
│   │   └── interceptor.ts   # Network request interceptor
│   ├── popup/               # React UI
│   │   ├── components/      # React components
│   │   ├── App.tsx          # Main component
│   │   ├── index.tsx        # Entry point
│   │   ├── index.html       # HTML template
│   │   └── styles.css       # Styles
│   ├── types/               # TypeScript types
│   │   └── linkedin.ts      # LinkedIn API types
│   ├── utils/               # Utilities
│   │   └── parser.ts        # LinkedIn API response parser
│   ├── icons/               # Extension icons
│   └── manifest.json        # Extension manifest
├── dist/                    # Built extension (generated)
├── package.json
├── tsconfig.json
├── webpack.config.js
└── README.md
```

## Notes

- ⚠️ The extension **does not intercept or modify** LinkedIn API requests
- 📊 Data is collected only for **analytical purposes**
- 💾 All data is stored **locally in the browser** (chrome.storage.local)
- 🔒 The extension does not send data to external servers
- 📝 Maximum 1000 posts are stored simultaneously (old ones are removed)
- 🔄 Posts are cleared on page refresh to show only current session data

## Troubleshooting

### Extension not collecting data

1. Make sure you are on the `https://www.linkedin.com/feed` page
2. Check the browser console (F12) for errors
3. Reload the LinkedIn page
4. Reload the extension in `chrome://extensions/`

### Posts not displaying

1. Make sure you have scrolled through the feed on LinkedIn (the extension collects data when new posts load)
2. Check that the extension is active (icon should be visible)
3. Try clearing data and starting over

## License

MIT
