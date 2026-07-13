<p align="center">
  <img src="public/vite.svg" alt="FocusFlow" width="64" height="64" />
</p>

<h1 align="center">FocusFlow</h1>

<p align="center">
  <strong>AI-powered productivity platform. Decompose goals, focus deep, track progress.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-6366f1?logo=react" alt="React" />
  <img src="https://img.shields.io/badge/TypeScript-6.0-3178c6?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-8-646cff?logo=vite" alt="Vite" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
</p>

---

## ✨ What is FocusFlow?

FocusFlow bridges the gap between simple to-do lists and complex project management. The core innovation is **AI Task Decomposition** — paste a vague goal like "Launch a Shopify Store" and the AI breaks it into actionable, bite-sized subtasks.

Combined with a built-in **Pomodoro focus timer** and **drag-and-drop task organization**, FocusFlow transforms chaotic mental load into structured, executable flow.

## 🎯 Features

| Feature | Description |
|---------|-------------|
| 🧠 **AI Task Breakdown** | LLM-powered decomposition of complex projects into manageable steps |
| ⏱️ **Focus Timer** | Pomodoro timer with circular SVG progress ring, presets, and task linking |
| 📋 **Drag & Drop Tasks** | Reactive fluid UI with DND Kit for effortless prioritization |
| 📊 **Analytics** | Recharts-powered dashboards — weekly sessions, priority breakdowns |
| 📅 **Calendar** | Monthly calendar with task indicators and daily task view |
| 💾 **Local Persistence** | Zustand + localStorage — your data stays on your device |
| 🎨 **Premium UI** | Dark theme inspired by Linear, glass morphism, smooth animations |

## 🚀 Quick Start

```bash
# Clone
git clone https://github.com/hemoyt/promda.git
cd promda

# Install
npm install

# Develop
npm run dev

# Build
npm run build
```

## 🔑 AI Setup

FocusFlow uses [OpenRouter](https://openrouter.ai) for AI task decomposition:

1. Get a free API key at [openrouter.ai/keys](https://openrouter.ai/keys)
2. Go to **Settings** in the app
3. Paste your key (starts with `sk-or-v1-`)
4. Use **AI Decompose** to break down any goal

## 🏗️ Architecture

```
src/
├── components/
│   ├── Timer.tsx          # Pomodoro with SVG ring
│   ├── TaskList.tsx        # DND Kit drag-and-drop
│   ├── AIDecompose.tsx     # OpenRouter API integration
│   ├── Dashboard.tsx       # Stats + weekly charts
│   ├── CalendarView.tsx    # Monthly calendar
│   ├── Analytics.tsx       # Recharts charts
│   ├── Sidebar.tsx         # Navigation
│   └── Settings.tsx        # Config + data management
├── store.ts                # Zustand state management
├── lib/api.ts              # OpenRouter API client
└── index.css               # Full design system
```

## 📦 Tech Stack

- **React 19** + **TypeScript** + **Vite 8**
- **Zustand** — state management
- **DND Kit** — drag and drop
- **Recharts** — data visualization
- **Lucide React** — icons
- **OpenRouter API** — AI decomposition

## 📄 License

MIT © Ibrahim Ahmed
