# Renpay

Payments & downloads for real estate media editing. Manage orders, collect payments, and deliver watermarked previews.

## Project Structure

```
├── index.html      # Main HTML entry point
├── app.js          # Application logic
├── styles.css      # Styles
├── vercel.json     # Vercel deployment configuration
├── .env.example    # Environment variable template
└── .gitignore      # Git ignore rules
```

## Local Development

Open `index.html` in a browser, or use a local server:

```bash
npx serve .
```

## Deploy to Vercel

### Option A: Deploy via Vercel Dashboard (Recommended)

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **Import Git Repository**
3. Select the **Nguyentr-jpg/Renpay** repository
4. Configure the project:
   - **Project Name:** `renpay`
   - **Framework Preset:** `Other` (this is a static site)
   - **Root Directory:** `.` (default)
   - **Build Command:** leave empty (override to empty)
   - **Output Directory:** `.` (override to `.`)
   - **Install Command:** leave empty (override to empty)
5. Add environment variables from `.env.example` (see below)
6. Click **Deploy**

### Option B: Deploy via Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy (from project root)
vercel --name renpay

# Deploy to production
vercel --prod --name renpay
```

### Environment Variables

Copy `.env.example` to `.env.local` for local development. For Vercel, add these in **Project Settings > Environment Variables**:

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |
| `DATABASE_URL` | PostgreSQL connection string |
| `R2_ACCOUNT_ID` | Cloudflare R2 account ID |
| `R2_ACCESS_KEY_ID` | R2 access key ID |
| `R2_SECRET_ACCESS_KEY` | R2 secret access key |
| `R2_BUCKET_NAME` | R2 bucket name |
| `R2_PUBLIC_URL` | R2 public CDN URL |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `NEXTAUTH_URL` | App URL (e.g. `https://renpay.vercel.app`) |
| `NEXTAUTH_SECRET` | Auth secret (`openssl rand -base64 32`) |
| `NEXT_PUBLIC_APP_URL` | Public app URL |

### Post-Deployment Checklist

- [ ] Verify the site loads at `https://renpay.vercel.app`
- [ ] Add a custom domain in Vercel if needed (Project Settings > Domains)
- [ ] Update Stripe webhook URL to `https://renpay.vercel.app/api/webhooks/stripe`
- [ ] Verify Supabase URL allowlist includes the Vercel domain
- [ ] Rotate any credentials that were previously exposed in version control
