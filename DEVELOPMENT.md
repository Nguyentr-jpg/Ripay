# Renpay Development Progress

**Last Updated:** 2026-02-08
**Project:** Real estate media editing payment system
**Tech Stack:** Vanilla JS, Supabase (PostgreSQL), Prisma, Vercel

---

## ✅ Completed Setup

### 1. **Database - Supabase PostgreSQL**

**Connection:**
- Provider: Supabase (Transaction Pooler)
- Host: `aws-1-ap-northeast-1.pooler.supabase.com:6543`
- Database: `postgres`
- Important: Must use `?pgbouncer=true` parameter for Prisma

**Database Schema:**

#### Users Table
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  password_hash VARCHAR(255),
  role VARCHAR(50) DEFAULT 'CLIENT' NOT NULL,
  email_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
```

**Status:** ✅ Created and tested
- Email login working
- User creation tested successfully
- Session persistence implemented

#### Other Tables (Created via SQL migration)
- `orders` - Order management
- `order_items` - Order line items
- `files` - File attachments
- `payments` - Payment records

**Full migration:** See [supabase-migration.sql](supabase-migration.sql)

---

### 2. **Authentication System**

**Implementation:** Email-only login (no password)

**Files:**
- [`api/auth.js`](api/auth.js) - Backend authentication endpoint
- [`app.js`](app.js#L605-L643) - Frontend login logic

**Flow:**
1. User enters email
2. API finds or creates user in database
3. Session stored in `sessionStorage`
4. Auto-restore on page reload

**Status:** ✅ Working on production

---

### 3. **API Integrations**

#### Google Drive API
- **Purpose:** Fetch thumbnails from shared folders
- **API Key:** Configured in `.env`
- **Quota:** 1 billion requests/day (FREE)
- **Status:** ✅ API key created and configured

#### Dropbox API
- **Purpose:** Fetch thumbnails from shared links
- **Access Token:** Configured in `.env`
- **Quota:** 500 requests/hour (FREE)
- **Status:** ✅ Token created and configured

#### Media Fetch Endpoint
**File:** [`api/fetch-media.js`](api/fetch-media.js)

**Features:**
- Auto-detects Google Drive vs Dropbox links
- Fetches file list from shared folders
- Returns thumbnail URLs
- Supports both image and video files

**Usage:**
```javascript
POST /api/fetch-media
{
  "url": "https://drive.google.com/drive/folders/ABC123..."
}

Response:
{
  "success": true,
  "provider": "google-drive",
  "count": 15,
  "files": [
    {
      "id": "abc123",
      "name": "photo1.jpg",
      "type": "image/jpeg",
      "thumbnailUrl": "https://...",
      "downloadUrl": "https://...",
      "provider": "google-drive"
    }
  ]
}
```

**Status:** ✅ Implemented, ready for testing

---

## 🔐 Environment Variables

### Local Development (`.env`)
```env
DATABASE_URL=postgresql://postgres.fbshrbmmzfpiyjattxop:51ZOaASaOxlSlCnq@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true

GOOGLE_DRIVE_API_KEY=AIzaSyCIDpPh74L0hXFMIJ5CMiWhS3FQ7xOqesg

DROPBOX_ACCESS_TOKEN=sl.u.AGSghggRa1K4XXvBLE...
```

### Vercel Production
Same variables configured in Vercel → Settings → Environment Variables

**Important:**
- ⚠️ Never commit `.env` to Git
- ✅ DATABASE_URL must include `?pgbouncer=true`
- ✅ All env vars applied to Production, Preview, and Development

---

## 📁 Project Structure

```
renpay/
├── api/
│   ├── auth.js          # Email authentication
│   ├── orders.js        # Order CRUD operations
│   └── fetch-media.js   # Google Drive/Dropbox integration
├── prisma/
│   └── schema.prisma    # Database schema
├── app.js               # Main frontend logic
├── index.html           # UI
├── styles.css           # Styles
├── .env                 # Environment variables (local)
└── vercel.json          # Vercel config
```

---

## 🚀 Deployment

### Vercel
- **URL:** https://renpay-dvjqtfadh-nguyens-projects-c9f4fbf2.vercel.app
- **Branch:** main (production)
- **Environment Variables:** Configured ✅
- **Status:** Deployed and working

### Deployment Checklist
- [x] DATABASE_URL with `?pgbouncer=true`
- [x] GOOGLE_DRIVE_API_KEY
- [x] DROPBOX_ACCESS_TOKEN
- [x] Redeploy after env var changes

---

## 🔄 Current Flow

### 1. User Login
```
1. User enters email → /api/auth
2. Find/create user in Supabase
3. Return user data
4. Store in sessionStorage
5. Show app interface
```

### 2. Create Order
```
1. User fills order form
2. POST /api/orders with items
3. Save to Supabase database
4. Filter orders by user email
5. Display in overview
```

### 3. Media Preview (In Progress)
```
1. User pastes Drive/Dropbox link
2. POST /api/fetch-media
3. Auto-detect link type
4. Fetch thumbnails
5. Display gallery preview
```

---

## 📋 Next Steps

### 🔥 CRITICAL - Must Do Now
- [ ] **Add environment variables to Vercel:**
  - `DROPBOX_ACCESS_TOKEN`
  - `GOOGLE_DRIVE_API_KEY`
- [ ] **Redeploy from Vercel dashboard**
- [ ] **Test media fetching with real Dropbox/Drive links**
- [ ] **Verify gallery displays actual thumbnails**

### Immediate (After Media Works)
- [x] ~~Integrate fetch-media into order creation flow~~ ✅ Done
- [x] ~~Update frontend to display thumbnails in gallery~~ ✅ Done
- [ ] Verify end-to-end order creation with media
- [ ] Test with different Dropbox link formats
- [ ] Add loading indicators during media fetch
- [ ] Handle API errors gracefully

### Short-term
- [ ] Store mediaFiles in database (currently only in memory)
- [ ] Implement watermark overlay for unpaid orders
- [ ] Add payment gateway integration (Stripe)
- [ ] File download after payment
- [ ] Order status workflow automation (UNPAID → PAID → COMPLETED)

### Long-term
- [ ] Admin dashboard for order management
- [ ] Email notifications (order created, payment received)
- [ ] Invoice generation PDF
- [ ] Analytics and reporting
- [ ] Multi-user collaboration features

---

## 🐛 Critical Issues Fixed (Session 2026-02-08)

### ❌ Issue 1: Order Creation Failed - Decimal Type Mismatch
**Error:** `P2032 - Invalid prisma.order.create() invocation`
```
Error converting field "status" of expected non-nullable type "String", found incompatible value of "UNPAID".
```

**Root Cause:**
- Database uses PostgreSQL ENUM types (`order_status`, `user_role`, etc.)
- Prisma schema was using `String` type instead of ENUMs
- Type mismatch when trying to insert ENUM values

**Solution:**
1. Updated `prisma/schema.prisma` to define ENUMs:
```prisma
enum OrderStatus {
  UNPAID
  PAID
  PROCESSING
  COMPLETED
  CANCELLED
  @@map("order_status")
}
```
2. Updated models to use ENUM types instead of String
3. Regenerated Prisma Client: `npx prisma generate`
4. Also converted Decimal fields to String format:
```javascript
totalAmount: String(Number(totalAmount).toFixed(2))
unitPrice: String(Number(item.unitPrice || 0).toFixed(2))
```

**Status:** ✅ Fixed - Orders now save successfully to database

**Files Changed:**
- `prisma/schema.prisma` - Added 4 ENUMs (UserRole, OrderStatus, PaymentGateway, PaymentStatus)
- `api/orders.js` - Convert Decimals to String format

---

### ❌ Issue 2: User Data Isolation Breach
**Problem:** Users could see other users' orders on same browser

**Root Cause:**
- `localStorage` used global key `"renpay-data-v1"` for all users
- When User A logged in, orders saved to localStorage
- When User B logged in on same browser, they inherited User A's localStorage data

**Solution:**
1. Clear localStorage on logout:
```javascript
state.orders = [];
state.payments = [];
localStorage.removeItem(STORAGE_KEY);
```

2. Clear localStorage on new login:
```javascript
// Clear previous user's data
state.orders = [];
state.payments = [];
localStorage.removeItem(STORAGE_KEY);
await fetchOrdersFromDB(); // Fetch current user's data
```

3. Remove `loadState()` from `init()` - always fetch fresh from database
4. Preserve user-specific data when restoring sessions

**Status:** ✅ Fixed - Each user now only sees their own orders

**Files Changed:**
- `app.js` - Updated login, logout, restoreSession, and init functions

---

### ❌ Issue 3: Gallery Shows Placeholders Instead of Real Images
**Problem:** Gallery displays "RENPAY PREVIEW" watermark placeholders instead of actual Dropbox/Drive thumbnails

**Root Cause:**
- `/api/fetch-media` endpoint exists but not integrated into frontend
- No API call to fetch media files when creating order
- Gallery has no actual file data to display

**Solution:**
1. Created `fetchMediaFromLink()` helper function:
```javascript
const fetchMediaFromLink = async (link) => {
  if (!link || (!link.includes('dropbox.com') && !link.includes('drive.google.com'))) {
    return null;
  }

  const response = await fetch('/api/fetch-media', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: link })
  });

  const data = await response.json();
  return data.success ? data.files : null;
};
```

2. Integrated into `createOrder()`:
```javascript
// Fetch media files if link is provided
let mediaFiles = null;
if (item.link) {
  btnCreate.textContent = 'Fetching media from Dropbox/Google Drive...';
  mediaFiles = await fetchMediaFromLink(item.link);
}

// Store with order
newOrders.push({
  ...order,
  mediaFiles: mediaFiles || []
});
```

3. Updated `openGallery()` to display fetched files:
```javascript
if (mediaFiles.length > 0) {
  mediaFiles.forEach((file) => {
    const item = document.createElement("div");
    item.className = "gallery-item";
    if (file.thumbnailUrl) {
      item.style.backgroundImage = `url('${file.thumbnailUrl}')`;
    }
    grid.appendChild(item);
  });
}
```

4. Preserve `mediaFiles` when syncing with database

**Status:** ⚠️ NEEDS TESTING - Code implemented, waiting for Vercel environment variables

**Files Changed:**
- `app.js` - Added fetchMediaFromLink, updated createOrder, openGallery, fetchOrdersFromDB

**Dependencies:**
- Requires `DROPBOX_ACCESS_TOKEN` in Vercel environment variables
- Requires `GOOGLE_DRIVE_API_KEY` in Vercel environment variables

---

### ⚠️ Issue 4: Missing Environment Variables on Vercel
**Problem:** Media fetching fails because tokens not configured on Vercel

**Required Variables:**
```
DROPBOX_ACCESS_TOKEN=sl.u.AGR3X-87g6N66-QpZ84wn6S22Haue...
GOOGLE_DRIVE_API_KEY=AIzaSyCIDpPh74L0hXFMIJ5CMiWhS3FQ7xOqesg
```

**Setup Steps:**
1. Go to Vercel Dashboard → Project → Settings → Environment Variables
2. Add both variables
3. Select all environments: Production, Preview, Development
4. Save and trigger redeploy from Deployments tab

**Status:** ⏳ PENDING - User adding environment variables

---

## 🐛 Known Issues & Solutions (Historical)

### Issue 1: "Authentication failed" on Vercel
**Cause:** DATABASE_URL missing `?pgbouncer=true`
**Solution:** Add parameter to connection string in Vercel env vars

### Issue 2: "Prepared statement already exists"
**Cause:** Transaction pooler doesn't support prepared statements
**Solution:** Use `?pgbouncer=true` parameter

### Issue 3: Orders not saving to database
**Cause:** Database connection issues or missing env vars
**Solution:** Verify DATABASE_URL in Vercel and redeploy

---

## 💡 Important Notes

### Database Connection
- **Local:** Works with pooler connection
- **Vercel:** Must use `?pgbouncer=true` for serverless
- **Direct connection (port 5432):** Blocked by IPv4 issue - use pooler only

### API Keys Security
- Google Drive API key is **restricted** to Google Drive API only
- Dropbox token is long-lived access token
- All credentials should be kept secret

### Cost Estimates
- **Supabase:** Free tier (1GB storage, sufficient for now)
- **Google Drive API:** FREE (within 1B requests/day quota)
- **Dropbox API:** FREE (within 500 req/hour quota)
- **Vercel:** Free tier (sufficient for MVP)

**Total monthly cost:** ~$0 for current setup ✅

---

## 🔗 Useful Links

- [Supabase Dashboard](https://supabase.com/dashboard)
- [Google Cloud Console](https://console.cloud.google.com/)
- [Dropbox Developer Console](https://www.dropbox.com/developers/apps)
- [Vercel Dashboard](https://vercel.com/dashboard)
- [Prisma Docs](https://www.prisma.io/docs)

---

## 👤 Contact & Support

**Developer:** Claude Sonnet 4.5
**Project Owner:** tranthiennguyen27@gmail.com
**Repository:** (Add your Git repo URL here)

---

## 🔧 Troubleshooting Guide

### Media Fetching Not Working

**Symptoms:**
- Gallery shows "RENPAY PREVIEW" placeholders
- Alert: "Could not fetch media: [error]"
- Console shows fetch errors

**Debug Steps:**

1. **Check Browser Console (F12)**
```
Look for logs:
✓ "Fetching media from link: https://..."
✓ "Fetch media response: { success: true, files: [...] }"
❌ "Fetch media failed: Dropbox access token not configured"
```

2. **Verify Environment Variables on Vercel**
```bash
# Required variables:
DROPBOX_ACCESS_TOKEN=sl.u.AGR...
GOOGLE_DRIVE_API_KEY=AIzaSyC...
DATABASE_URL=postgresql://...?pgbouncer=true
```

3. **Test API Endpoint Directly**
```bash
curl -X POST https://your-site.vercel.app/api/fetch-media \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.dropbox.com/scl/fo/..."}'
```

4. **Check Dropbox Token Validity**
- Token format: `sl.u.` prefix for long-lived tokens
- Verify token has folder read permissions
- Check token hasn't expired

5. **Common Errors:**

| Error | Cause | Solution |
|-------|-------|----------|
| "Dropbox access token not configured" | Missing env var | Add to Vercel, redeploy |
| "Failed to fetch from Dropbox" | Invalid token or expired | Generate new token |
| "No files returned" | Empty folder or wrong link | Check folder has files, verify link |
| CORS error | Missing headers | Check api/fetch-media.js CORS setup |

### Order Creation Issues

**Problem:** Orders not saving to database

**Check:**
1. Console for error: `"API error:" { error: "..." }`
2. Network tab: `/api/orders` request status
3. Vercel logs for backend errors

**Common Fixes:**
- DATABASE_URL has `?pgbouncer=true`
- User is logged in (check sessionStorage)
- Prisma client regenerated after schema changes

### User Isolation Issues

**Problem:** User sees other users' orders

**Fix:**
1. Clear browser localStorage
2. Logout and login again
3. Hard refresh (Ctrl + Shift + R)

---

## 📝 Session History

**Session Date:** 2026-02-08
**Developer:** Claude Sonnet 4.5
**Session Focus:** Critical bug fixes and media integration

### Major Changes This Session:
1. ✅ Fixed Prisma ENUM type mismatch (P2032 error)
2. ✅ Fixed user data isolation with localStorage clearing
3. ✅ Integrated Dropbox/Google Drive media fetching
4. ✅ Added comprehensive error logging
5. ⏳ Pending: Environment variable setup on Vercel

### Files Modified:
- `prisma/schema.prisma` - Added ENUMs for database types
- `api/orders.js` - Fixed Decimal handling
- `app.js` - User isolation, media fetching, gallery display
- `DEVELOPMENT.md` - This documentation update

### Commits:
- `e7aaf72` - Fix Decimal type handling in order creation API
- `e2a5b1c` - Fix ENUM type mismatch between database and Prisma schema
- `a201ffc` - Fix user data isolation - prevent users from seeing each other's orders
- `4ccaaea` - Integrate Dropbox/Google Drive media fetching into order gallery
- `8137aa9` - Add detailed logging for media fetching debug

---

**To continue development:**
1. Clone repository
2. Copy `.env` file with credentials
3. Run `npm install`
4. Read this document for full context
5. **Check "Next Steps" section for current priorities**
6. Review "Critical Issues Fixed" for context on recent changes

---

**End of Development Documentation**
