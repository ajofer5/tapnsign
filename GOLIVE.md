# TapnSign — Go-Live Checklist

## Stripe
- [ ] Switch Stripe account from Sandbox to Live mode
- [ ] Re-create the TapnSign Identity Webhook in Stripe **Live mode** (same URL: `https://gsjmawqvazjnodfjdysd.supabase.co/functions/v1/stripe-identity-webhook`)
- [ ] Update `STRIPE_IDENTITY_WEBHOOK_SECRET` in Supabase edge function secrets with the **live mode** signing secret
- [ ] Update `STRIPE_SECRET_KEY` in Supabase edge function secrets with the **live mode** secret key
- [ ] Update `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` in `.env` with the **live mode** publishable key
- [ ] Apply for Stripe Identity activation in live mode (requires Stripe review/approval)

## Apple Developer
- [ ] Sign up for Apple Developer account ($99/year)
- [ ] Enable push notifications (`aps-environment` entitlement) — code is complete and ready
- [ ] Build and test on a real device with a production build
- [ ] Submit app to the App Store (screenshots, description, keywords, age rating, etc.)

## Legal
- [ ] Write and publish a Privacy Policy (required for App Store and Stripe Identity)
- [ ] Write and publish Terms of Service
  - [ ] Include language reserving the right to impose listing limits (e.g. "TapnSign may place limits on the number of active listings a user may have at any time in order to ensure a quality experience for all users.")

## Website (tapnsign.vercel.app)
- [ ] Clean up visual issues on the public verify page
- [ ] Add "View Public Page" button in-app from the Certificate sheet

## Nice-to-Have Before Launch
- [ ] Onboarding screen for new users explaining how TapnSign works
- [ ] Support contact (email or in-app) for users with verification issues or disputes
- [ ] Promotional discount flow for verification fee ($2.99 discounted rate)
