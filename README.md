# TruthLens 🔮

**Discover Your True Identity** — An interactive church lesson game about false beliefs, deception, self-acceptance, and discovering your true identity in Christ.

## Features

- **Modern Glassmorphism UI** with smooth animations and floating orb backgrounds
- **5 Question Types**: Multiple Choice, True/False, Fill-in-the-Blank, Matching, and Ordering
- **Real-Time Multiplayer** via Socket.IO — play together on a local network
- **Live Leaderboard** with instant score updates and rankings
- **Timer System** with visual countdown ring and warning sounds
- **Progress Bar** tracking question advancement
- **Sound Effects** using Web Audio API (no audio files needed)
- **Score System** with time bonuses for quick answers
- **Admin Dashboard** to add, edit, and delete questions without touching code
- **QR Code Generation** for easy player joining
- **Works Offline** — runs entirely on a local network, no internet required
- **Mobile-First Responsive Design** — optimized for phones and tablets
- **Confetti Celebration** on game completion

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start the server
npm start

# 3. Open in browser
#    Player view:  http://localhost:3000
#    Admin panel:  http://localhost:3000/admin.html
```

The server will display the local network IP address. Share that URL (e.g., `http://192.168.1.100:3000`) with players on the same network.

## How to Play

### For the Host (Admin)
1. Open `/admin.html` on your device
2. Review or edit questions in the **Questions** tab
3. Display the **QR Code** tab for players to scan
4. Click **Start Game** when all players have joined
5. Click **Next Question** to advance through each question
6. Click **End Question Early** if you want to reveal the answer before the timer runs out
7. Click **Reset Game** to start over

### For Players
1. Navigate to the server URL (or scan the QR code)
2. Tap **Begin the Journey**
3. Enter your name and tap **Join Session**
4. Wait for the host to start the game
5. Read the story intro, then get ready for questions
6. Answer each question before the timer runs out
7. Faster answers earn more points (time bonus!)
8. View your results and the final leaderboard

## Project Structure

```
TruthLens/
├── package.json              # Dependencies and scripts
├── README.md                  # This file
├── server/
│   ├── index.js               # Express + Socket.IO server
│   └── gameState.js           # Game logic and state management
├── data/
│   └── questions.json         # All questions stored as JSON
└── public/
    ├── index.html             # Player game interface
    ├── admin.html             # Admin dashboard
    ├── css/
    │   ├── style.css          # Main glassmorphism design system
    │   └── admin.css          # Admin dashboard styles
    ├── js/
    │   ├── app.js             # Player game client
    │   ├── admin.js           # Admin dashboard client
    │   └── sound.js           # Web Audio API sound effects
    └── assets/                # Static assets directory
```

## Question Types

### Multiple Choice
Players select one of four options. Instant feedback on correct/incorrect.

### True / False
Players choose True or False. Great for statements about beliefs and Scripture.

### Fill in the Blank
Players type the missing word(s) from a Bible verse. Accepts multiple valid answers.

### Matching
Players match items from the left column to the right column using dropdowns.

### Ordering
Players drag items into the correct order (supports both mouse drag and touch).

## Adding & Editing Questions

Use the **Questions** tab in the admin dashboard to:
- **Add** new questions of any type
- **Edit** existing questions (click the ✏️ button)
- **Delete** questions (click the 🗑️ button)

Questions are stored in `data/questions.json` and persist across server restarts.

### Adding Questions via JSON

You can also edit `data/questions.json` directly:

```json
{
  "id": 21,
  "type": "multiple-choice",
  "category": "Identity in Christ",
  "question": "Your question text here?",
  "options": ["Option A", "Option B", "Option C", "Option D"],
  "correctAnswer": 0,
  "explanation": "Why the correct answer is right..."
}
```

For matching questions:
```json
{
  "id": 22,
  "type": "matching",
  "category": "Deception",
  "question": "Match each lie with the truth:",
  "pairs": [
    { "left": "I am alone", "right": "God will never leave me" },
    { "left": "I am unlovable", "right": "Nothing separates me from God's love" }
  ],
  "explanation": "Explanation here"
}
```

For ordering questions:
```json
{
  "id": 23,
  "type": "ordering",
  "category": "Self-Acceptance",
  "question": "Put these in order:",
  "items": ["Step one", "Step two", "Step three"],
  "correctOrder": [0, 1, 2],
  "explanation": "Explanation here"
}
```

## Scoring

- **Correct answer**: 100 base points + time bonus
- **Time bonus**: 2 points per second remaining on the timer
- **Incorrect answer**: 0 points
- **Timer**: 30 seconds per question

## Technical Details

- **Server**: Node.js + Express + Socket.IO
- **Frontend**: Vanilla HTML, CSS, JavaScript (no frameworks needed)
- **Sound**: Web Audio API (generates tones programmatically)
- **QR Codes**: Generated server-side using the `qrcode` package
- **Network**: Works on local WiFi without internet access
- **Port**: Default 3000 (configurable via `PORT` environment variable)

## Customization

### Timer Duration
Change `timerDuration` in `server/gameState.js` (default: 30 seconds).

### Theme Colors
Edit CSS custom properties in `public/css/style.css`:
```css
:root {
  --primary: #6c5ce7;      /* Main purple */
  --accent: #00cec9;        /* Teal accent */
  --bg-dark: #0a0a1a;       /* Dark background */
  /* ... more variables */
}
```

### Story Intro
Edit the `storyIntro` section in `data/questions.json`.

## License

Built for church and educational use. Share freely!
