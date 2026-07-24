# Debug Config System MVP

## Goal

Build a runtime configuration system for a React app hosted on GitHub
Pages, allowing collaborators to tune animation and gameplay parameters
without modifying source code.

------------------------------------------------------------------------

## MVP Features

### 1. Default Configuration

-   Create `src/config/defaultConfig.ts`
-   Store all configurable parameters in a single object.
-   Include a top-level `version` field.

Example:

``` ts
export const defaultConfig = {
  version: 1,
  animation: {
    amplitude: 50,
    speed: 2,
  },
  particle: {
    count: 100,
    size: 4,
  },
};
```

------------------------------------------------------------------------

### 2. ConfigManager

Responsible for:

-   Loading configuration
-   Saving configuration
-   Importing / Exporting JSON
-   Resetting to defaults

Suggested API:

``` ts
ConfigManager.load();
ConfigManager.save();
ConfigManager.reset();
ConfigManager.import();
ConfigManager.export();
```

------------------------------------------------------------------------

### 3. Runtime Config

The application should only read from a single runtime config object.

    defaultConfig
          │
          ▼
    Runtime Config
          ▲
          │
     Tweakpane

------------------------------------------------------------------------

### 4. Tweakpane Integration

-   Bind controls directly to Runtime Config.
-   Organize parameters into folders (Animation, Particle, etc.).
-   Changes should take effect immediately.

------------------------------------------------------------------------

### 5. Auto Save

-   Listen for parameter changes.
-   Debounce saves by \~500 ms.
-   Persist Runtime Config into localStorage.

Benefits:

-   Survives page refresh
-   Survives browser crash
-   No manual save required

------------------------------------------------------------------------

### 6. Startup Logic

    Application Start

    ↓

    Load localStorage

    ↓

    Exists?

    YES → Runtime Config

    NO

    ↓

    Load defaultConfig

    ↓

    Save localStorage

------------------------------------------------------------------------

### 7. Import / Export

Export:

-   Download current Runtime Config as JSON.

Import:

-   Select a JSON file.
-   Validate version.
-   Replace Runtime Config.
-   Refresh Tweakpane.
-   Save to localStorage.

------------------------------------------------------------------------

### 8. Reset to Default

    defaultConfig
          ↓
    Runtime Config
          ↓
    Refresh Pane
          ↓
    Save localStorage

------------------------------------------------------------------------

### 9. Debug Mode

Only show the debug panel when the URL contains:

    ?debug

Example:

    https://example.github.io/?debug

This prevents normal users from accidentally modifying parameters.

------------------------------------------------------------------------

### 10. Versioning

Every configuration should contain:

``` json
{
  "version": 1
}
```

Future versions can migrate older configs safely.

------------------------------------------------------------------------

## Suggested File Structure

``` text
src/
├── config/
│   ├── defaultConfig.ts
│   ├── ConfigManager.ts
│   ├── ConfigStorage.ts
│   ├── ConfigExporter.ts
│   └── ConfigSchema.ts
└── debug/
    └── DebugPanel.ts
```

------------------------------------------------------------------------

## Future Enhancements (Out of Scope)

-   Presets
-   Undo / Redo
-   Parameter Search
-   Favorites
-   Shareable URLs
-   Config Diff
