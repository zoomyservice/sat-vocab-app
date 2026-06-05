# SAT Vocab — Expo Go app

Runs in **Expo Go** on your phone (Expo SDK 54). Vocab stages, 5 practice modes, the 🤖 Coach chat,
and your answers saved on-device **and** (optionally) to your Cloudflare Worker.

## Run it
```
cd sat-vocab-expo
npm install
npx expo install @react-native-async-storage/async-storage   # aligns the version to SDK 54
npx expo start
```
Then open **Expo Go** on your phone and scan the QR code (phone + computer on the same Wi-Fi).

## Where your answers are stored
- **On the phone:** every attempt updates per-word mastery, saved with AsyncStorage (survives app restarts).
- **In the cloud (optional):** if you connect the Coach (below), each attempt is also POSTed to your
  Worker's D1 database (`attempts` table) so your progress is reviewable anywhere.

## Turn on the Coach chatbot
The chat uses Gemini Flash through your own Cloudflare Worker (cheap; your key stays server-side,
never in the app). Deploy the Worker in `../sat-coach/worker` following
`../sat-coach/SETUP_coach_chatbot.md`, then in the app: Home → **Set up** → paste your Worker URL.

## Add more words
Edit `words.js` — one line per word `["word","pos","definition","example sentence with the word"]`.
New stages form automatically every 14 words.
