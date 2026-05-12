# Namazkar Testing Guide - Android Emulator

## Setup Status ✅

- **Emulator**: Pixel 10 Pro running (`emulator-5554`)
- **Dev Server**: Running on `http://localhost:8000` (port 8000)
- **Port Forwarding**: `adb reverse tcp:8000 tcp:8000` configured
- **Commit**: Dev branch with IndexedDB persistence implemented

---

## Access App in Emulator

### Option 1: Chrome Browser (Recommended)
1. Open Chrome in the emulator
2. Navigate to: `http://localhost:8000`
3. The app will load instantly from IndexedDB cache (if cached)

### Option 2: Android Studio AVD Manager
- Use AVD Manager built into Android Studio for GUI access

---

## Testing Checklist

### Phase 1: Fresh Install & Basic Functionality ✅
- [ ] App loads successfully
- [ ] Prayer times display correctly
- [ ] IndexedDB shows "loaded from IndexedDB" in console
- [ ] City dropdown works
- [ ] Prayers can be enabled/disabled

### Phase 2: Push Notifications Setup 🔔
- [ ] Click "Enable notifications" bell icon
- [ ] Accept notification permission prompt
- [ ] Log shows successful subscription creation
- [ ] Check Firestore: New subscription document created with:
  - Valid `endpoint` 
  - Valid `keys.p256dh` and `keys.auth` (base64 encoded, ~87 and ~22 bytes)
  - `city` = selected city
  - `enabledPrayers` = checked prayers
  - `status` = 'active'
  - `badAttemptCount` = 0

### Phase 3: Settings Persistence 💾
- [ ] Select a city (e.g., "Delhi")
- [ ] Enable specific prayers (e.g., only Fajr, Asr)
- [ ] Close Chrome browser
- [ ] Reopen Chrome and navigate to `http://localhost:8000` again
- [ ] Verify: City is still Delhi
- [ ] Verify: Same prayers still enabled (restored from server)

### Phase 4: Push Delivery Test 📬
1. **Admin Dashboard**: Open `http://localhost:8000/admin.html` (on dev machine)
2. **Send Custom Push**: 
   - Title: "Test Message"
   - Body: "IndexedDB Test"
   - Click "Send to All"
3. **Emulator Chrome**: Should see notification popup
   - ✅ If received immediately: 410 errors are FIXED
   - ❌ If no notification: Check Firestore for `badAttemptCount` > 1

### Phase 5: Cold Start Performance 🚀
- [ ] Close the PWA completely
- [ ] Reopen
- [ ] Prayer times should display **instantly** (no ~2-3 second wait)
- [ ] Console shows "loaded from IndexedDB"
- [ ] No network spinner/loading delay

### Phase 6: Offline Functionality 📴
- [ ] Enable airplane mode on emulator
- [ ] Close and reopen app
- [ ] App should still display prayer times
- [ ] Check console: "loaded from IndexedDB"
- [ ] Try to send push from admin (should fail gracefully on network request)

---

## Verification in Console (DevTools)

### Open DevTools
1. In Chrome on emulator: **Menu (⋮) → More tools → Developer tools**
2. Go to **Console** tab

### Expected Logs
```
[persist-storage] IndexedDB initialized
[persist-storage] Timetable loaded from IndexedDB (age: 123 ms)
[persist-storage] Offsets loaded from IndexedDB (age: 125 ms)
Prayer data loaded from IndexedDB
```

### IndexedDB Inspection
1. DevTools → **Application** tab
2. Left sidebar → **IndexedDB**
3. Expand `namazkar-cache` database
4. Verify stores exist: `timetable`, `offsets`
5. Click each store to view cached data

---

## Verification in Firestore

### Check Subscription Document
1. Firebase Console → Namazkar project → Firestore
2. Collection: `subscriptions`
3. Find document with most recent `createdAt` timestamp
4. Verify fields:
   - `endpoint`: Valid web push endpoint URL
   - `keys.p256dh`: Base64 string (~87 bytes decoded)
   - `keys.auth`: Base64 string (~22 bytes decoded)
   - `status`: `'active'` (not `'invalid'`)
   - `badAttemptCount`: `0` (not incremented)
   - `city`: Selected city
   - `enabledPrayers`: Object with prayer names as keys

### Check Invalidation Logs (if pushes fail)
1. Collection: `subscription_invalidation_logs`
2. Look for recent entries
3. Verify `errorCode: 410` is NOT present (indicates fix worked)

---

## Debugging Commands

### ADB Commands for Emulator
```bash
# List connected devices
adb devices

# Open emulator shell
adb shell

# View logcat (Android logs)
adb logcat | grep -i "chrome\|push\|notification"

# Take screenshot
adb shell screencap -p /sdcard/screenshot.png
adb pull /sdcard/screenshot.png ~/Desktop/

# Clear app cache
adb shell pm clear com.android.chrome
```

### Vercel Logs
```bash
# View recent deployments
vercel logs

# View specific function logs
vercel logs --follow api/send-push
```

---

## Expected Behavior by Test Phase

| Phase | Action | Expected Result | Success Indicator |
|-------|--------|-----------------|-------------------|
| 1 | Load app | Displays prayer times | "loaded from IndexedDB" in console |
| 2 | Enable notifications | Permission accepted | Firestore doc created |
| 3 | Change city, close/reopen | Settings persist | City retained after reopen |
| 4 | Send push from admin | Notification received | Popup appears immediately |
| 5 | Reopen app | Instant load | No loading delay |
| 6 | Enable airplane mode | App still works | Prayer times visible offline |

---

## Troubleshooting

### Issue: "localhost:8000 refused connection"
**Solution**: 
```bash
# Restart port forwarding
adb reverse --remove-all
adb reverse tcp:8000 tcp:8000
```

### Issue: "No notification received"
**Solution**:
1. Check emulator notification settings: Enable notifications
2. Check Firestore `badAttemptCount` value
3. If > 1: Subscription marked invalid (check invalidation logs)
4. If = 0: Push service might be blocking (check Vercel logs)

### Issue: "IndexedDB not loading"
**Solution**:
1. Check DevTools → Application → IndexedDB (should exist)
2. Check Console for errors (should say "IndexedDB initialized")
3. If missing: Try `await clearCache()` in console
4. Reload page to trigger fresh IndexedDB save

### Issue: "Chrome won't open developer tools"
**Solution**:
1. Use `adb shell am logcat` for Android logs
2. Or access via remote debugging:
   ```bash
   # On dev machine, enable remote debugging
   chrome://inspect
   ```

---

## Next Steps After Verification

1. ✅ IndexedDB cold-start working → Proceed to Phase 2
2. ✅ Push notifications received → Test multi-device
3. ✅ Settings persist → Validate server fallback works
4. ✅ All tests pass → Merge dev → main → Auto-deploy to Vercel

---

## Contact & Logs

- **Vercel Deployment**: `dpl_T7iTks3uzEyKTJCULcqfyixG8ALB`
- **Firestore Project**: `namazkar-pwa`
- **Dev Server Logs**: Check terminal running `python3 -m http.server 8000`
- **Emulator Logs**: `adb logcat -s TAG_NAME`
