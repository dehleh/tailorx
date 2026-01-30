# Tailor-X - Deployment Guide

## 🚀 Deploying with Expo

Your app is ready to deploy! Choose the deployment method that fits your needs.

---

## Option 1: Expo Publish (Quick & Easy)

**Best for:** Testing, internal distribution, over-the-air updates

### Steps:

1. **Login to Expo:**
```bash
npx expo login
```

2. **Publish your app:**
```bash
npx expo publish
```

3. **Share with testers:**
   - Open the link provided (e.g., `exp://exp.host/@username/xfit`)
   - Share via Expo Go app

**✅ Pros:** Instant updates, no app store approval needed
**❌ Cons:** Users need Expo Go app installed

---

## Option 2: EAS Build (Production Apps)

**Best for:** App Store & Google Play Store distribution

### Setup:

1. **Install EAS CLI:**
```bash
npm install -g eas-cli
eas login
```

2. **Configure EAS:**
```bash
eas build:configure
```

3. **Build for Android:**
```bash
eas build --platform android --profile production
```

4. **Build for iOS:**
```bash
eas build --platform ios --profile production
```

5. **Submit to stores:**
```bash
eas submit --platform android
eas submit --platform ios
```

**✅ Pros:** Standalone apps, app store distribution, native performance
**❌ Cons:** Takes longer, requires app store accounts

---

## Option 3: Development Build

**Best for:** Testing with native modules (camera, ML)

```bash
# Create development build
eas build --platform android --profile development

# Install on device and run
npx expo start --dev-client
```

---

## 📱 Quick Deployment (Recommended Start)

**For immediate testing:**

```bash
# 1. Make sure app is running
npm start

# 2. Scan QR code with Expo Go
# Your app is already accessible at: exp://192.168.0.105:8081
```

**For production deployment:**

```bash
# 1. Update app version in app.json
# 2. Build and submit
eas build --platform android --profile production
eas submit --platform android
```

---

## 🔧 Configuration

Your `app.json` is already configured with:
- App name: xfit
- Package name: com.anonymous.xfit
- Icon & splash screen ready

### Update before deploying:
1. Change `owner` and `slug` in app.json
2. Update package names (Android/iOS)
3. Add app icons and splash screens
4. Configure permissions properly

---

## 📊 Deployment Checklist

- [ ] Test app thoroughly on physical device
- [ ] Update version number in app.json
- [ ] Configure proper app icons (1024x1024 for icon)
- [ ] Set up splash screen
- [ ] Configure permissions (camera, storage)
- [ ] Test on both iOS and Android
- [ ] Create app store listings
- [ ] Submit for review

---

## 🌐 Expo Dashboard

Monitor your deployments at: https://expo.dev

- View builds
- Manage updates
- Check analytics
- Handle submissions

---

## 🔄 Over-the-Air Updates

After initial deployment, push updates instantly:

```bash
npx expo publish
# or
eas update --branch production
```

Users get updates automatically without app store approval!

---

## 💰 Pricing

- **Expo Publish:** Free
- **EAS Build:** 
  - Free tier: Limited builds/month
  - Paid: Unlimited builds
- **App Store Fees:**
  - Apple: $99/year
  - Google: $25 one-time

---

## 📞 Need Help?

- Expo Docs: https://docs.expo.dev
- EAS Build: https://docs.expo.dev/build/introduction/
- Submit Apps: https://docs.expo.dev/submit/introduction/

---

**Ready to deploy?** Start with `npx expo publish` for quick testing! 🚀
