# Project Structure

```
faster-html2video/
├── src/                    # TypeScript source files
│   ├── faster-html2video.ts   # Main library
│   ├── cli.ts                 # Command-line interface
│   └── example.ts             # Example usage
│
├── dist/                   # Compiled JavaScript (generated)
│   └── *.js, *.d.ts          # Compiled files
│
├── viewers/                # HTML viewers for testing
│   ├── view-video-dynamic.html  # Viewer with metadata
│   ├── view-transparent.html    # Transparency test viewer
│   ├── view-canvas.html        # Canvas-based viewer
│   └── view-bounce.html        # Bounce demo viewer
│
├── examples/               # Example outputs
│   └── bounce-demo.webm       # Sample video
│
├── node_modules/           # Dependencies
├── package.json            # Project configuration
├── tsconfig.json          # TypeScript configuration
├── .gitignore             # Git ignore rules
├── README.md              # Main documentation
├── PERFORMANCE.md         # Performance optimization guide
├── todo.md                # Development tasks
├── test-animation.html    # Test animation page
└── output.webm           # Generated video (example output)
```

## Quick Start

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run example
npm run example

# Use CLI
npx faster-html2video [url] [output] -d [duration] [options]
```

## Key Files

- **src/faster-html2video.ts**: Core video capture logic
- **src/cli.ts**: Command-line interface
- **viewers/**: HTML files for viewing generated videos
- **test-animation.html**: Sample animation for testing