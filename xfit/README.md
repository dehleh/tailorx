# Tailor-X - Body Measurement App

<div align="center">

📏 **Accurate Body Measurements Using AI Technology** 📸

*Perfect Fit, Every Time*

</div>

## 🎯 Overview

Tailor-X is a modern React Native mobile application that uses AI-powered camera technology to capture accurate body measurements. Built with Expo and TypeScript, it provides a seamless experience for users to scan, track, and manage their body measurements for perfect-fitting clothing.

## ✨ Features

- 🏠 **Home Dashboard** - Quick access to all features and recent measurements
- 📸 **AI Camera Scan** - Capture body measurements using device camera with real-time guidance
- 📏 **Measurement Tracking** - View and manage all your body measurements
- 👤 **User Profile** - Personalize your experience and manage preferences
- 🔄 **Unit Conversion** - Switch between metric (cm) and imperial (inch) systems
- 📊 **Measurement History** - Track your progress over time
- 💾 **Offline Storage** - All data saved locally with AsyncStorage
- 🔄 **State Management** - Powered by Zustand for efficient data flow
- 🤖 **ML Integration** - Ready for TensorFlow Lite body measurement models
- ☁️ **Cloud Sync** - API client ready for backend integration
- 🎨 **Modern UI** - Beautiful, intuitive interface with smooth animations

## 🛠️ Tech Stack

- **Framework:** React Native with Expo
- **Language:** TypeScript
- **Navigation:** React Navigation (Bottom Tabs)
- **Camera:** Expo Camera
- **State Management:** Zustand
- **Local Storage:** AsyncStorage
- **HTTP Client:** Axios
- **ML Ready:** TensorFlow Lite integration hooks
- **Styling:** React Native StyleSheet with custom theming

## 📱 Measurements Tracked

- Height & Weight
- Chest, Waist, Hips
- Shoulders, Neck
- Sleeve, Inseam
- Thigh, Calf

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Expo Go app (for mobile testing)
- Android Studio / Xcode (for native builds)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd tailorx/xfit
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

### Running the App

- **Android:** Press `a` in the terminal or scan QR code with Expo Go
- **iOS:** Press `i` in the terminal or scan QR code with Expo Go (iOS only)
- **Web:** Press `w` in the terminal

## 🔧 Configuration

1. **Environment Variables** (Optional):
   ```bash
   cp .env.example .env
   # Edit .env with your API URL and settings
   ```

2. **API Integration** (Optional):
   - Update `EXPO_PUBLIC_API_URL` in `.env`
   - Implement backend endpoints matching `src/services/measurementApi.ts`

3. **ML Model Integration** (Optional):
   - See [IMPLEMENTATION.md](IMPLEMENTATION.md) for TensorFlow Lite setup
   - Replace mock implementation in `src/services/mlService.ts`

## 📂 Project Structure

```
xfit/
├── src/
│   ├── screens/           # App screens
│   │   ├── HomeScreen.tsx
│   │   ├── CameraScreen.tsx
│   │   ├── MeasurementsScreen.tsx
│   │   └── ProfileScreen.tsx
│   ├── navigation/        # Navigation configuration
│   │   └── AppNavigator.tsx
│   ├── stores/            # Zustand state management
│   │   ├── measurementStore.ts
│   │   └── userStore.ts
│   ├── services/          # API and external services
│   │   ├── apiClient.ts
│   │   ├── measurementApi.ts
│   │   ├── mlService.ts
│   │   └── storageService.ts
│   ├── components/        # Reusable components
│   ├── constants/         # Theme, colors, and constants
│   │   ├── colors.ts
│   │   └── theme.ts
│   ├── types/            # TypeScript type definitions
│   │   ├── measurements.ts
│   │   └── user.ts
│   └── utils/            # Helper functions
│       ├── helpers.ts
│       └── useAppInitialization.ts
├── assets/               # Images, fonts, etc.
├── App.tsx              # Root component
├── .env.example         # Environment variables template
├── IMPLEMENTATION.md    # Detailed feature documentation
└── package.json
```

## 🎨 Color Scheme

- **Primary:** #6B4EFF (Purple)
- **Secondary:** #FF6B9D (Pink)
- **Accent:** #4ECDC4 (Teal)
- **Background:** #F8F9FA (Light Gray)

## 🔮 Future Enhancements

- [ ] AI-powered body measurement detection using TensorFlow Lite
- [ ] Cloud sync for measurement history  
- [ ] User authentication and multi-device support
- [ ] Size recommendations for popular clothing brands
- [ ] Export measurements as PDF
- [ ] Share measurements with tailors/retailers
- [ ] 3D body visualization
- [ ] Multi-language support
- [ ] Dark mode theme
- [ ] Measurement comparison charts
- [ ] Integration with smart scales

## 🎯 Current Implementation Status

✅ **Completed:**
- Full UI/UX with 4 screens
- State management with Zustand
- Local data persistence with AsyncStorage
- API client infrastructure
- ML service structure (mock implementation)
- Camera integration
- Unit conversion (cm/inch)

🚧 **Ready for Integration:**
- TensorFlow Lite ML model
- Backend API connection
- User authentication
- Cloud synchronization

See [IMPLEMENTATION.md](IMPLEMENTATION.md) for detailed documentation.

## 📱 Screenshots

*Coming soon...*

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License.

## 👥 Authors

Tailor-X Development Team

## 📞 Support

For support, email support@tailorx.com or open an issue in the repository.

---

<div align="center">
Made with ❤️ by the Tailor-X Team
</div>
