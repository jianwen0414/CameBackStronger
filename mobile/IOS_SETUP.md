# iOS Setup Guide for NightWalk Mobile

> **Important**: iOS development requires a Mac with macOS 12.0+ and Xcode 14+. You cannot build iOS apps on Windows.

## Prerequisites (Mac Only)

### 1. Install Xcode
1. Open **App Store** on your Mac
2. Search for **"Xcode"**
3. Click **"Get"** / **"Install"** (13+ GB download)
4. After installation, open Xcode and accept the license agreement
5. Install Command Line Tools:
   ```bash
   xcode-select --install
   ```

### 2. Install Homebrew (if not already installed)
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### 3. Install Node.js (if not already on Mac)
```bash
brew install node
# Verify
node -v  # Should be v20+
npm -v
```

### 4. Install Watchman (React Native dependency)
```bash
brew install watchman
```

### 5. Install Ruby (for CocoaPods)
macOS comes with Ruby, but you may need to update it:
```bash
brew install ruby
# Add to PATH (add to ~/.zshrc or ~/.bash_profile)
echo 'export PATH="/opt/homebrew/opt/ruby/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### 6. Install CocoaPods
```bash
sudo gem install cocoapods
# Verify
pod --version  # Should be 1.11+
```

---

## Project Setup

### 1. Clone/Transfer the Project to Mac
If you're moving from Windows:
```bash
# On Mac, navigate to your projects folder
cd ~/Projects
git clone <your-repo-url>
cd CameBackStronger-1/mobile
```

### 2. Install Node Dependencies
```bash
npm install
```

### 3. Install Ruby Dependencies (Bundler)
```bash
bundle install
```

### 4. Install iOS Native Dependencies (CocoaPods)
```bash
cd ios
bundle exec pod install
cd ..
```

**Note**: This will download all native iOS libraries (Google Maps, React Native navigation, etc.)

---

## Environment Configuration

### 1. Create `.env` file
Copy the example and add your keys:
```bash
cp .env.example .env
```

Edit `.env` and add:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
GOOGLE_MAPS_API_KEY=your-google-maps-api-key
```

### 2. Enable Google Maps API Key in Xcode
The API key is automatically configured via `react-native-config`, but verify in Xcode:
1. Open `ios/NightWalkMobile.xcworkspace` (NOT .xcodeproj)
2. Select the **NightWalkMobile** project
3. Go to **Info** tab
4. Verify `GMSApiKey` is present

---

## Building & Running

### Method 1: Command Line (Easiest)
```bash
# Start Metro bundler
npm start

# In a new terminal, build & run iOS
npm run ios
```

This will:
- Build the app
- Launch iOS Simulator automatically
- Install the app

**Specify a simulator:**
```bash
npm run ios -- --simulator="iPhone 15 Pro"
```

**List available simulators:**
```bash
xcrun simctl list devices
```

### Method 2: Xcode (For debugging/signing)
1. Open `ios/NightWalkMobile.xcworkspace` in Xcode
2. Select a simulator from the top bar (e.g., "iPhone 15 Pro")
3. Click the **Play** button (▶️) or press `Cmd + R`

---

## Running on Physical iOS Device

### 1. Connect Your iPhone
- Connect iPhone via USB
- Trust the computer when prompted on iPhone

### 2. Configure Signing in Xcode
1. Open `ios/NightWalkMobile.xcworkspace`
2. Select **NightWalkMobile** project
3. Select **Signing & Capabilities** tab
4. **Team**: Select your Apple ID (add if needed)
5. Change **Bundle Identifier** to something unique:
   - Example: `com.yourname.nightwalkmobile`

### 3. Build to Device
```bash
npm run ios -- --device
```

Or in Xcode:
1. Select your iPhone from the device list
2. Click **Play** (▶️)

**First time**: You'll need to trust the developer certificate on your iPhone:
- Go to **Settings** → **General** → **VPN & Device Management**
- Tap your Apple ID and **Trust**

---

## Troubleshooting

### "Command PhaseScriptExecution failed"
```bash
cd ios
pod deintegrate
pod install
cd ..
```

### "No bundle URL present"
Make sure Metro is running:
```bash
npm start
```

### "Code signing error"
1. In Xcode, go to **Signing & Capabilities**
2. Enable **Automatically manage signing**
3. Select your Team

### "Module not found: react-native-config"
```bash
cd ios
bundle exec pod install
cd ..
npm start -- --reset-cache
```

### Metro bundler stuck
```bash
npm start -- --reset-cache
# Or
watchman watch-del-all
rm -rf $TMPDIR/metro-*
npm start
```

---

## Permissions (iOS Info.plist)

The following permissions are already configured in `ios/NightWalkMobile/Info.plist`:

- **Camera**: For AR Scanner (if re-enabled)
- **Location**: "We need your location to show nearby safety threats"
- **Vibration**: Haptic feedback (no permission needed on iOS)

To modify permission messages:
1. Open `ios/NightWalkMobile/Info.plist` in Xcode
2. Find keys like `NSLocationWhenInUseUsageDescription`
3. Edit the description text

---

## Production Build (App Store)

### 1. Archive in Xcode
1. Select **Any iOS Device (arm64)** as target
2. **Product** → **Archive**
3. Wait for build to complete

### 2. Distribute
1. Click **Distribute App**
2. Choose **App Store Connect**
3. Follow Apple's submission process

**Note**: Requires a paid Apple Developer account ($99/year)

---

## Key Differences: iOS vs Android

| Feature | iOS | Android |
|---------|-----|---------|
| **AR Scanner** | Not supported (no ARCore) | Supported |
| **Maps** | Apple Maps (default) or Google Maps | Google Maps |
| **Permissions** | Runtime prompts | Runtime + Manifest |
| **Build Time** | Faster | Slower (C++ compile) |

---

## Next Steps

1. ✅ Install Xcode and tools (Mac)
2. ✅ Install dependencies (`npm install`, `pod install`)
3. ✅ Configure `.env` file
4. ✅ Run on simulator (`npm run ios`)
5. ✅ Test on physical device
6. ✅ Submit to App Store (optional)

---

## Useful Commands

```bash
# Install dependencies
npm install
cd ios && bundle exec pod install && cd ..

# Run on simulator
npm run ios

# Run on specific simulator
npm run ios -- --simulator="iPhone 15 Pro"

# Run on connected device
npm run ios -- --device

# Clean build
cd ios
xcodebuild clean
rm -rf ~/Library/Developer/Xcode/DerivedData/*
cd ..

# Update CocoaPods
cd ios
bundle exec pod update
cd ..
```

---

## Resources

- [React Native iOS Setup](https://reactnative.dev/docs/environment-setup?platform=ios)
- [Xcode Documentation](https://developer.apple.com/xcode/)
- [CocoaPods Guides](https://guides.cocoapods.org/)
- [Apple Developer Portal](https://developer.apple.com/)
