# ListBoost Design System

The UI uses one token scale in `public/styles.css`, shared by every public and app route. These examples are plain HTML snippets because ListBoost has no framework or build step.

## Light

```html
<section class="section">
  <div class="container grid">
    <header class="section-head">
      <p class="eyebrow">Primitive set</p>
      <h2>Reusable product UI</h2>
      <p class="section-sub">Buttons, cards, inputs, badges, feedback and listing previews share the same spacing, radius and colour tokens.</p>
    </header>

    <div class="hero-cta">
      <a class="btn btn-primary" href="/signup">Start with 5 free credits</a>
      <a class="btn btn-secondary" href="/example">Try the demo</a>
      <button class="btn btn-ghost" type="button">Quiet action</button>
      <button class="btn btn-danger" type="button">Delete</button>
    </div>

    <article class="card card-elevated">
      <span class="badge badge-brand">Best value</span>
      <h3>Seller</h3>
      <p class="muted">150 credits per month for regular Vinted sellers.</p>
    </article>

    <label>
      Item notes
      <textarea class="textarea" placeholder="zara dress size 10 worn twice navy blue"></textarea>
      <span class="field-helper">Paste rough notes. ListBoost will structure them.</span>
    </label>

    <div class="toast toast-success">Copied to clipboard.</div>

    <div class="empty-state">
      <div class="empty-state-icon" aria-hidden="true"></div>
      <h3>No listings yet</h3>
      <p>Your generated listings will appear here.</p>
      <a class="btn btn-primary" href="/app/notes">Generate a listing</a>
    </div>
  </div>
</section>
```

## Dark

```html
<section class="section" data-theme="dark">
  <div class="container grid">
    <header class="section-head">
      <p class="eyebrow">Dark mode</p>
      <h2>Designed, not inverted</h2>
      <p class="section-sub">The same classes pick up the dark token mirror from `:root[data-theme="dark"]`.</p>
    </header>

    <article class="pricing-card is-featured">
      <span class="badge badge-brand">Best value</span>
      <h3>Seller</h3>
      <p class="pricing-price"><strong>150</strong><span>credits/month</span></p>
      <p class="pricing-meta">£12/month</p>
      <p class="pricing-copy">For active sellers who list every week and want credits ready.</p>
      <button class="btn btn-primary pricing-buy" type="button">Subscribe monthly</button>
    </article>

    <article class="listing-card is-elevated">
      <div class="listing-card-header">
        <div class="listing-card-title">
          <span class="badge badge-brand">Sell-ready listing</span>
          <h3>Zara Navy Satin Midi Dress UK 10</h3>
        </div>
        <strong class="listing-price">£18</strong>
      </div>
      <p class="listing-description">Elegant navy satin midi dress from Zara in a UK 10. Worn twice and in lovely condition.</p>
      <div class="listing-keywords"><span>zara dress</span><span>uk 10</span><span>navy satin</span></div>
    </article>
  </div>
</section>
```
