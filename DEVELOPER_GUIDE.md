# KaaroViewer - Developer Guide

> **⚠ STALE — written for A-Frame era (pre-2026).** The platform has migrated to Three.js canvas. The A-Frame components in `components/` still exist but the active development surface is `canvas/`, `pipeline/`, and `enrichers/`. See `README.md` and `pipeline/README.md` for the current architecture.

## Project Overview

**KaaroViewer** is an immersive 3D visualization platform built on **A-Frame** that displays social media content and knowledge graph data (Wikidata) in a virtual reality environment. It enables users to explore entities, posts, and connections across multiple social platforms through an interactive 3D interface.

## Key Features

- **3D Visualization**: Built with A-Frame (WebXR-enabled)
- **Multi-Platform Support**: Instagram (v1), Twitter (WIP), Reddit (WIP), Github (WIP), Wikidata (WIP)
- **Entity Linking**: Automatic entity recognition and matching using Wikidata
- **Knowledge Integration**: Fetches images and metadata from Wikidata SPARQL endpoints
- **Real-Time Communication**: MQTT integration for controller/viewer synchronization
- **Word Map Visualization**: Contextual word frequency analysis and visualization
- **Remote Control**: Mobile controller interface for session management

## Project Structure

```
kaaroViewer/
├── index.html                    # Main A-Frame viewer application
├── style.css                     # Styling for UI elements
├── kaaro.js                      # Core main application logic
├── kaaro_stream.mjs              # Streaming data handling (currently empty)
│
├── Components (A-Frame Custom Components)
│   ├── components/
│   │   ├── wikidata-entity.js   # 3D entity card visualization component
│   │   ├── rain-of-entities.js  # Particle effect for entities
│   │   ├── rain-of-posts.js     # Particle effect for social posts
│   │   ├── sky-canvas.js        # Background canvas rendering
│   │   ├── alongpath.js         # Path animation component
│   │   └── tcgcard.js           # Trading card style display
│
├── Core Functionality
│   ├── entity_matching.mjs       # NLP entity recognition & Wikidata linking
│   ├── entity_linking.js         # Alternative entity linking module
│   ├── fetch_knowledge.mjs       # Wikidata SPARQL queries & image fetching
│   ├── context_wordmap.mjs       # Word frequency analysis & charting
│   │
│   ├── 2viewr_functions.mjs      # Viewer manipulation functions
│   ├── gviewr_functions.mjs      # Gaming/UX-specific viewer functions
│   └── instagram.js              # Instagram platform integration
│
├── Controller Interface
│   ├── controller/
│   │   ├── index.html           # Mobile controller UI
│   │   ├── style.css            # Controller styling
│   │   └── speech-to-text-to-mqtt.js  # Voice input & MQTT communication
│
├── Dependencies
│   └── pod_modules/
│       ├── await-request.js     # HTTP request utility
│       └── wiki.js              # Wikidata utility functions
│
├── Static Assets
│   ├── images/                  # Image assets
│   ├── assets/type/             # Type/category assets
│   └── library/
│       └── gig-worker-projects.md  # Reference documentation
│
└── Configuration & Metadata
    ├── package-lock.json        # Dependency lock file
    ├── .gitignore
    ├── .git/
    ├── README.md
    └── DEVELOPER_GUIDE.md        # This file

### Specialized Visualizations
- `entity-test.html` - Entity component testing sandbox
- `viz-gig-economy-india.html` - Example visualization: Gig economy data
```

## Core Technologies

| Technology | Purpose |
|-----------|---------|
| **A-Frame** | 3D/VR visualization framework (WebXR) |
| **Wikidata** | Knowledge graph & entity data source |
| **SPARQL** | Query language for Wikidata |
| **MQTT** | Real-time communication protocol (Paho client) |
| **Google Charts** | Data visualization & word frequency mapping |
| **Web Speech API** | Voice input for mobile controller |

## Architecture Overview

### Data Flow Pipeline

```
User Input (Text/Voice)
    ↓
Entity Matching (entity_matching.mjs)
    ↓ Wikidata QID
Fetch Knowledge (fetch_knowledge.mjs)
    ↓ Images, metadata, properties
Viewer Functions (2viewr_functions.mjs)
    ↓ 3D object creation
A-Frame Components (wikidata-entity.js, etc.)
    ↓
3D Scene Rendering
```

### Key Modules Explained

#### 1. **kaaro.js** (Main Application)
- Entry point for the application
- Handles text parsing and routing
- Coordinates entity matching with Wikidata
- Manages demo data loading
- Orchestrates viewer updates

**Key Functions:**
- `parseAndActOnText(text)` - Processes user input (text or Wikidata QID)
- `sendSampleText()` - Loads demo data
- `sampleForKaaroDemo()` - Demo scenario with gig economy data
- `logTextToCurrentSessionViewer(text)` - UI logging

#### 2. **entity_matching.mjs** (Entity Recognition)
- Uses OpenTapioca API for entity linking
- Converts natural language to Wikidata QIDs
- Returns list of matched entities

**Key Functions:**
- `entityMatch(query)` - Sends text to OpenTapioca for entity recognition

#### 3. **fetch_knowledge.mjs** (Knowledge Integration)
- Queries Wikidata SPARQL endpoint
- Fetches entity images and metadata
- Handles image URL formatting & filtering

**Key Functions:**
- `getEntityImages(QID)` - Fetches primary & secondary images
- `_getEntityPrimaryImages(QID)` - SPARQL query for entity images
- `_getEntitySecondaryImages(QID)` - Related entity images
- `getEntityByte(QID)` - Fetches entity metadata

#### 4. **2viewr_functions.mjs** (Viewer Control)
- Manages 3D object creation in A-Frame
- Handles camera positioning and movement
- Manages entity rendering pipeline

**Key Functions:**
- `pushEntityToViewer(entity)` - Adds entity to 3D scene
- `pushImagesToViewer(images)` - Renders image gallery
- `jumpToAHeight(height)` - Camera movement
- `entityInGraphCheck(qid)` - Checks if entity already displayed

#### 5. **gviewr_functions.mjs** (Gaming/UX Functions)
- Gaming-specific viewer features
- Session management
- Visual feedback for user actions

**Key Functions:**
- `showMicAtLevel()` - Shows microphone indicator
- `showSessionEnd()` - End session UI
- `showSessionError()` - Error handling UI
- `switchCamera()` - Camera view switching

#### 6. **context_wordmap.mjs** (Word Frequency Analysis)
- Analyzes text for word frequency
- Generates context visualization via Google Charts
- Updates word map display

**Key Functions:**
- `updateChartWithStrings(strings[], focusWord)` - Updates word frequency chart
- `getFocusWord()` - Retrieves current focus word

#### 7. **components/wikidata-entity.js** (3D Entity Card)
- A-Frame custom component for rendering entity cards
- Creates 3D boxes with entity information
- Displays label, type, description, and images

**Schema Properties:**
- `id` - Wikidata QID
- `label` - Entity name
- `instanceof` - Entity type/category
- `connectionType` - How entity is related
- `description` - Entity description text
- `image_url` - Primary entity image
- `claims` - Additional properties

#### 8. **controller/speech-to-text-to-mqtt.js** (Mobile Controller)
- Web Speech API integration for voice input
- MQTT client for real-time communication
- Mobile UI for session control

**Features:**
- Device ID registration
- Voice input processing
- Real-time message relay to viewer

## Data Sources & APIs

### External APIs Used

1. **Wikidata SPARQL Endpoint**: `https://query.wikidata.org/sparql`
   - Primary knowledge graph queries
   - Entity metadata and images
   - Relationship mapping

2. **OpenTapioca API**: `https://opentapioca.org/api/annotate`
   - Entity linking from natural language
   - Named entity recognition (NER)

3. **Wikimedia Commons API**
   - Image hosting and metadata
   - File information & checksums

4. **MQTT Broker**: `wss://api.akriya.co.in:8084/mqtt`
   - Real-time viewer-controller communication
   - Session state synchronization

## Getting Started for Developers

### Prerequisites
- Modern web browser with WebGL support
- Node.js (for local development/testing)
- Basic understanding of A-Frame and JavaScript/ES6 modules

### Running Locally

1. **Clone the repository**
   ```bash
   git clone <repo-url>
   cd kaaroViewer
   ```

2. **Start a local web server**
   ```bash
   # Using Python 3
   python -m http.server 8000
   
   # Or using Node.js http-server
   npx http-server
   ```

3. **Open in browser**
   ```
   http://localhost:8000/index.html
   ```

4. **Test the controller interface** (in another window/device)
   ```
   http://localhost:8000/controller/index.html
   ```

### Environment Notes
- No .env file needed - APIs use public endpoints
- MQTT broker is configured to `api.akriya.co.in`
- Uses CORS-friendly Wikidata endpoints

## Common Development Tasks

### Adding a New A-Frame Component

1. Create component file in `components/`
2. Register with `AFRAME.registerComponent()`
3. Define schema for component properties
4. Implement `init()`, `update()`, `tick()` lifecycle methods
5. Import in `index.html`
6. Use in viewer: `<a-entity my-component="property: value"></a-entity>`

**Example Pattern:**
```javascript
AFRAME.registerComponent('my-component', {
  schema: {
    color: { type: 'color', default: '#fff' }
  },
  init: function() {
    // One-time initialization
  },
  update: function() {
    // Called when schema data changes
  }
});
```

### Integrating a New Social Platform

1. Create `<platform>.js` (see `instagram.js` as reference)
2. Implement data fetching from platform API
3. Convert platform data to entity format
4. Use `pushEntityToViewer()` to render in 3D
5. Update platform list in README.md

### Querying Wikidata for New Data

All Wikidata queries use SPARQL. Example pattern from `fetch_knowledge.mjs`:

```javascript
const SPARQL = `
  SELECT ?item ?itemLabel
  WHERE {
    wd:Q<QID> wdt:P<property> ?item .
    SERVICE wikibase:label { 
      bd:serviceParam wikibase:language "en". 
    }
  }
`;
const response = await fetch(
  `https://query.wikidata.org/sparql?query=${SPARQL}&format=json`
);
```

**Useful Wikidata Properties:**
- `P18` - Image (instance of)
- `P31` - Instance of (type/category)
- `P279` - Subclass of
- `P625` - Coordinate location
- `P580` - Start time
- `P582` - End time

## Known Issues & WIP Features

- **Platforms in Development**: Twitter, Reddit, Github platform integration
- **kaaro_stream.mjs**: Currently empty - streaming data feature
- **entity_linking.js**: Uses outdated API approach (see entity_matching.mjs for current)

## Community & Support

- **Discord**: [KaaroViewer Community](https://discord.gg/B2cERQ5)
- **Issues**: Report bugs on GitHub with detailed reproduction steps
- **Code Style**: ES6+ modules, async/await patterns, camelCase naming

## Performance Tips

1. **Image Optimization**: Wikimedia images are already optimized for web
2. **SPARQL Queries**: Limit result sets with `LIMIT` clause
3. **3D Scene**: Monitor entity count - A-Frame can handle ~500-1000 entities depending on device
4. **MQTT**: Batch updates when possible to reduce message overhead

## Testing

- **Unit Testing**: No test framework currently configured
- **Manual Testing**: Use `entity-test.html` for component testing
- **Visual Testing**: `viz-gig-economy-india.html` for sample visualization

## Future Enhancements

- [ ] Complete platform integrations (Twitter, Reddit, Github)
- [ ] Implement kaaro_stream.mjs for streaming data
- [ ] Add TypeScript support
- [ ] Implement persistent session storage
- [ ] Add collaborative features for multi-user sessions
- [ ] Performance optimizations for mobile VR

## Troubleshooting

### CORS Errors
- Most Wikidata endpoints have CORS enabled
- For local development, ensure proper MIME types
- Use browser DevTools Network tab to diagnose

### Entity Not Rendering
- Check browser console for JavaScript errors
- Verify entity QID is valid on Wikidata.org
- Ensure images are loading (check image URLs)

### MQTT Connection Issues
- Verify broker URL is correct
- Check browser console for WebSocket errors
- Confirm device/session IDs are properly set

---

**Last Updated**: March 2026  
**Maintained By**: KaaroViewer Community
