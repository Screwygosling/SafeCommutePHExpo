# SafeCommutePHExpo

A mobile safety and navigation application built with Expo and React Native that helps users find safer commuting routes using real-time mapping, routing, and crime-risk analysis.

---

## Features

* 🗺️ Interactive map interface using Leaflet/WebView
* 📍 Real-time route navigation
* 🚦 Safe route recommendations
* ⚠️ Crime risk and danger zone visualization
* 📡 Backend API integration for route and safety data
* 📱 Cross-platform mobile app using Expo
* 🔄 Dynamic routing and navigation updates

---

## Tech Stack

### Frontend

* React Native
* Expo
* React Navigation
* React Native WebView
* Leaflet Maps

### Backend / Services

* Flask API
* OSRM Routing Engine
* Crime prediction / risk analysis models

### Other Tools

* Git & GitHub
* Docker (for OSRM self-hosting)
* Python

---

## Project Structure

```bash
SafeCommutePHExpo/
│
├── assets/               # Images, icons, fonts
├── components/           # Reusable UI components
├── screens/              # Application screens
├── utils/                # Helper functions and map utilities
├── services/             # API services
├── App.js                # Main application entry point
├── package.json
└── README.md
```

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/Screwygosling/SafeCommutePHExpo.git
cd SafeCommutePHExpo
```

### 2. Install dependencies

```bash
npm install
```

or

```bash
yarn install
```

---

## Running the App

### Start Expo

```bash
npx expo start
```

Then:

* Press `a` for Android emulator
* Press `i` for iOS simulator
* Scan the QR code using Expo Go on your phone

---

## Backend Setup

Make sure your backend server is running before launching the app.

Example Flask server:

```bash
python app.py
```

Update your API base URL inside the project configuration if needed.

---

## OSRM Self-Hosting

This project can use a self-hosted OSRM server for routing.

### Example Docker Setup

```bash
docker run -t -i -p 5000:5000 \
osrm/osrm-backend \
osrm-routed --algorithm mld /data/philippines-latest.osrm
```

---

## Screenshots

Add screenshots of:

* Home screen
* Route selection
* Safety heatmap
* Navigation view

Example:

```md
![Home Screen](assets/home.png)
```

---

## Future Improvements

* 🔥 Real-time crime reporting
* 🤖 AI-based danger prediction
* 👥 Community safety alerts
* 📊 Route safety analytics
* 🌙 Dark mode support
* 📍 Offline map support

---

## Contributors

* Reuther Felias
* Jerome Comapon
* Joshua Montifar
* Jon Ryan Salvamante

---

## License

This project is licensed under the MIT License.

---

## Repository

[SafeCommutePHExpo Repository](https://github.com/Screwygosling/SafeCommutePHExpo?utm_source=chatgpt.com)
