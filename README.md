# 📖 Literary Agent Portal

An AI-powered query tracker for Epic Fiction writers. Find agents, track submissions, generate personalized query letters, find comp titles, and analyze your pitch — all in one place.

## ✨ Features

- **AI Agent Finder** — Searches the web for literary agents currently open to Epic Fantasy
- **AI Query Letter Writer** — Generates personalized query letters per agent
- **AI Comp Title Finder** — Finds recent comparable titles via web search
- **AI Pitch Coach** — Analyzes your logline & synopsis and gives direct feedback
- **AI Synopsis Helper** — Writes agent-ready synopses at the right length
- **Full Query Tracker** — Track agents, statuses, requirements, history
- **Kanban Pipeline** — Visual board of your query pipeline
- **Pre-Query Checklist** — Never miss a step

## 🚀 Deploy to GitHub Pages (Free)

### Step 1 — Fork or clone this repo

Click **Fork** on GitHub, or:
```
git clone https://github.com/YOUR_USERNAME/literary-agent-portal.git
cd literary-agent-portal
```

### Step 2 — Update the base path in vite.config.js

Open `vite.config.js` and change `literary-agent-portal` to your actual GitHub repo name:

```js
base: '/YOUR-REPO-NAME/',
```

### Step 3 — Push to GitHub

```bash
git add .
git commit -m "Initial commit"
git push origin main
```

### Step 4 — Enable GitHub Pages

1. Go to your repo on GitHub → **Settings** → **Pages**
2. Under **Source**, select **GitHub Actions**
3. The workflow will run automatically and deploy your site

### Step 5 — Your site is live!

Your portal will be at:
```
https://YOUR_USERNAME.github.io/YOUR-REPO-NAME/
```

## 🔑 API Key

The portal uses the Anthropic API for AI features. On first launch, you'll be prompted to enter your API key.

**Get a free key:**
1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign up → API Keys → Create Key
3. New accounts get free credits

Your key is stored **only in your browser's localStorage** — never on any server.

## 🛠 Local Development

```bash
npm install
npm run dev
```

Open http://localhost:5173

## 📁 Project Structure

```
lit-portal/
├── src/
│   ├── App.jsx       # Full app (all components)
│   └── main.jsx      # Entry point
├── index.html
├── vite.config.js    # ← Update base path here!
├── package.json
└── .github/
    └── workflows/
        └── deploy.yml  # Auto-deploy on push to main
```
