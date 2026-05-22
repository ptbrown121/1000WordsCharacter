# 1000 WORDS Card Manager

A zero-dependency, mobile-first web application designed to digitally manage characters, mosaic tiles (cards), and dice pool mechanics for the **1000 WORDS** tabletop roleplaying game system.

## Features

### 1. The Mosaic (Card Management)
- **Full CRUD Support:** Create, read, update, and delete your character's tiles.
- **Dual Colors:** Assign exactly two rule-accurate colors to each tile, powering the Call/Burn mechanics.
- **Tag Builder:** Easily construct and append predefined mechanical tags (e.g., *Keen*, *Chain*, *Hidden*) or write custom narrative tags directly onto your cards.
- **Instant Burn:** Quickly burn cards with a single tap for out-of-combat utility or narrative checks.

### 2. Intelligent Dice Pool Engine ("The Call")
- **Automated Stat Pooling:** Select the GM's Call colors, and the system automatically pulls your matching stat dice into the pool.
- **Automated Burns:** Select a main Call Tile and matching Burn Tiles to build your pool. The Engine automatically calculates your total dice and your "Keep Adds" based on the number of burned tiles.
- **Dual Rolling Modes:** 
  - **Virtual Mode**: Instantly RNG roll your entire pool and automatically calculate the mathematically optimal (highest) total.
  - **Manual Mode**: Enter the physical dice you rolled at the table, and the Engine will validate them and calculate your optimal total.
- **Haywire Detection:** Alerts you if more than half of your dice roll a 1.

### 3. Tag Parsing Engine
- **Flat Bonuses:** Automatically parses tags on your Call tiles (like *Expert* or *Ironclad*) and calculates their total Die Steps (▟) to grant flat bonuses to your final roll.
- **Chaining:** Supports recursive resolution for `Chain [Tile]` tags. The engine searches your Mosaic, validates the chained tile, and automatically pulls its dice and bonuses into the pool (with infinite loop protection!).

### 4. XP Tracking & Auto-Estimator
- **Global XP Tracker:** Tracks your total spent XP against your earned XP across your entire character sheet.
- **Cascade Estimator:** When building a tile, use the **Auto-Estimate** button. The engine uses a mathematical algorithm derived from the rulebook's cascade logic to calculate the absolute cheapest optimal XP path to build that dice pool, while adding standard XP modifiers for specific tags.

### 5. Rest & Resources
- **Current/Max Tracking:** Track the current and maximum values of Health (HP), Energy (EN), and Reflex (RX).
- **Shadow (SH):** The Shadow resource is completely dynamic. The engine automatically calculates your maximum Shadow points based on the count of Black/White color slots on your tiles.
- **Global Rest:** A one-click "Rest & Reset" button immediately restores all resources to their maximums and un-burns all tiles in your mosaic.

### 6. Zero Build Toolchain
- **Portable Architecture:** Built using pure Vanilla JavaScript (ES6 Modules), HTML5, and CSS3. 
- **No Node/Webpack Required:** Simply open `index.html` in any modern web browser to run the app instantly.
- **Persistence:** Automatically saves your entire character state to your browser's `localStorage`.
- **Import/Export:** Export your character to a `.json` file to back them up or transfer them between devices.

## Getting Started

1. **Clone or Download** this repository.
2. Open `index.html` in your favorite web browser (Chrome, Safari, Firefox).
3. **That's it!** Begin building your character's stats and adding tiles to your mosaic. 

## Technical Architecture

- `index.html`: The core UI layout and Modals, utilizing a mobile-friendly glassmorphism aesthetic.
- `css/styles.css`: All styling, color variables, grid layouts, and card visual states (like the grayscale BURNT status).
- `js/app.js`: The DOM controller. Handles event bindings, UI updates, and bridges the data model to the HTML view.
- `js/data.js`: The Data model and Persistence engine. Manages `localStorage` reads/writes and JSON Import/Export.
- `js/pool.js`: The "Brain". Contains the ruleset logic, including recursive Tag Parsing, Pool validation, optimal total calculation, and the complex XP cascade algorithm.
