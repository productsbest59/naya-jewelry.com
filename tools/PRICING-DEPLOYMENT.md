# Consistent USD pricing

Run `node tools/test-pricing.mjs` from the repository root (Node 24).
All payment calls in this test are mocked. Do not test with a real charge.

## Release together

The static site changes and `supabase/functions/naya-paypal/index.ts` must
be released together. The PayPal function imports `../shared/pricing.js`;
include that shared module in its deployment. Apply the reviewed
`supabase-order-variant-pricing.sql` RPC update as part of the same release.
GitHub Pages alone deploys neither Edge Functions nor SQL changes.

The existing order RPC and ILS accounting remain unchanged. Tranzila stays
ILS. English PayPal checkout remains USD. The server uses Bank of Israel's
USD/ILS rate, cached for an hour; on failure it retains the last rate in the
running instance, initially falling back to 3.7. Store and checkout use the
same shared arithmetic and the rate exposed by PayPal's config endpoint.
Manual USD prices retain cents. A different ILS variant price is converted
using the shared rate rather than reusing the base product's manual USD price.

PayPal start prices from server-side order lines and product data, includes
the order's applied quantity promotion, and returns its USD total. Checkout
refuses a different amount/currency before presenting payment approval.
Capture verifies the original server-created PayPal quote rather than
recalculating after the buyer approved it. This also preserves pending
legacy PayPal quotes created before this change.

The updated RPC keeps its signature and ILS accounting and ignores client
`unitPrice`. It selects an option's positive price from server-side product
variants, matching the storefront's merged size/style label. Empty or zero
variant overrides use the base price (they are optional admin fields).
Legacy zero-price cart lines are repaired from catalogue/selection in the
store and checkout. No existing orders or product prices are rewritten.
Any stale cart/server price discrepancy is rejected before payment approval.

After release, verify English product/cart/checkout with a manual USD price,
an automatic price and 4/5-item promotions; verify Hebrew Tranzila amounts
remain ILS. Use a sandbox/test terminal for end-to-end payment approval.
