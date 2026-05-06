# ListBoost Homepage Feature Reality Audit

Date: 2026-05-06
Branch: homepage-premium-polish

This audit checks which product claims are safe to market on the public homepage today. Anything marked PARTIAL, BROKEN, or DOES NOT EXIST should not be presented as a fully available homepage feature.

| Feature | Status | Testing notes |
| --- | --- | --- |
| Google sign-in | WORKS | Automated OAuth test passes and the user confirmed Google sign-in works on the Railway preview. Homepage/auth can mention Google sign-in. |
| Email signup | WORKS | Auth flow tests cover signup, required name field, verification gate, login, logout, and session persistence. |
| Password reset flow | WORKS | Token-based forgot/reset password tests pass, including single-use token behaviour and safe error logging. |
| Mobile image upload from gallery | PARTIAL | Frontend exposes a separate gallery/file input with image and HEIC/HEIF accept values; needs real iPhone/Android hardware confirmation before strong marketing claims. |
| Mobile camera upload | PARTIAL | Frontend exposes a separate camera input with capture enabled; needs real iPhone/Android hardware confirmation before strong marketing claims. |
| AI listing generation | WORKS | Authenticated generation tests pass and output contains editable title, description, keywords, price guidance, checklist, and buyer reply sections. |
| Pricing guidance | WORKS | Returned as part of generated listing output and covered by UI contract assertions. |
| Buyer reply generator | WORKS | Available on generated outputs and as a Seller+ gated route; homepage copy should avoid implying it is available on every plan without context. |
| Listing history | WORKS | Seller+ gated history route and API tests pass. Homepage can mention saved history only as a paid workflow benefit. |
| Listing templates | DOES NOT EXIST | Current public copy says "Reusable listing templates (coming soon)"; remove from homepage marketing copy. |
| Listing score checker | WORKS | Seller+ gated score route and API contract tests pass. Homepage can mention it only as a paid workflow benefit. |
| Free trial flow | WORKS | Tests cover free users receiving a 3-listing allowance and hitting the subscription paywall after the limit. |
| Stripe checkout | WORKS | Subscription checkout and webhook tests pass in test mode. Homepage can say Stripe-secured billing, not live-payment claims. |

## Homepage Claim Rules

- Keep: Google sign-in, email signup, password reset, AI generation, pricing guidance, buyer replies, saved history, listing score, free trial, Stripe-secured billing.
- Qualify: photo upload on mobile, because code support exists but real-device QA is still required.
- Remove: listing templates and any "coming soon" feature from homepage marketing.
- Avoid: fake user numbers, fake testimonials, guaranteed sales, official Vinted partnership language, or claims that ListBoost posts directly to Vinted.
