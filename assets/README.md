# App Assets

This directory should contain the following image files (required by app.json):

- `icon.png` — 1024×1024 app icon
- `adaptive-icon.png` — 1024×1024 Android adaptive icon foreground
- `splash.png` — 1242×2436 splash screen image (optional — we use a solid color background)

For development, you can create placeholder images or copy them from a previous Expo project. For production, design proper icons.

To generate icons from a single source image, use:
```bash
npx @expo/cli generate-icons
```
