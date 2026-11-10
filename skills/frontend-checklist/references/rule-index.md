# Front-End Checklist — Rule Index (Critical + High)

> Nguồn: [thedaviddias/Front-End-Checklist](https://github.com/thedaviddias/Front-End-Checklist) — 390 rules tổng cộng, 11 categories.
> Index này chỉ liệt kê **critical + high priority** (phần bắt buộc cho quality gate).
> Tra cứu đầy đủ + hướng dẫn Check/Fix/Explain từng rule: https://frontendchecklist.io/rules

## accessibility (34 — 9 critical)

- 🔴 **aria-hidden-body** — Do not use aria-hidden on the document body  
- 🔴 **aria-input-field-name** — Ensure all input fields have accessible names  
- 🔴 **button-name** — Provide accessible names for buttons  
- 🔴 **flashing-content** — Prevent seizure-triggering flashing content  
- 🔴 **form-labels** — Associate labels with form controls  
- 🔴 **heading-hierarchy** — Use logical heading hierarchy  
- 🔴 **input-image-alt** — Provide alt text for image buttons  
- 🔴 **keyboard-navigation** — Enable keyboard navigation for all elements  
- 🔴 **zoom-reflow** — Support content reflow at 400% zoom  
- 🟠 **accessible-authentication** — Provide accessible authentication methods  
- 🟠 **aria-labels** — Provide accessible names for all interactive elements  
- 🟠 **aria-live-regions** — Announce dynamic content with ARIA live regions  
- 🟠 **aria-required-children** — Ensure ARIA roles contain required child roles  
- 🟠 **aria-valid-attr** — Ensure ARIA attributes are valid  
- 🟠 **autoplay-media** — Avoid autoplaying media  
- 🟠 **color-contrast** — Meet minimum color contrast ratios  
- 🟠 **content-without-css** — Ensure content remains usable without CSS  
- 🟠 **duplicate-id-active** — Use unique IDs for active elements  
- 🟠 **duplicate-id-aria** — Use unique IDs for ARIA references  
- 🟠 **focus-management** — Manage focus during dynamic interactions  
- 🟠 **focus-not-obscured** — Keep focused elements unobscured  
- 🟠 **focus-order** — Ensure logical focus order  
- 🟠 **link-text** — Use descriptive link text  
- 🟠 **modal-accessibility** — Make modal dialogs keyboard accessible  
- 🟠 **orientation** — Support both portrait and landscape orientation  
- 🟠 **reduced-motion** — Respect reduced motion preferences  
- 🟠 **redundant-entry** — Avoid redundant entry in the same process  
- 🟠 **screen-reader-testing** — Test with screen readers  
- 🟠 **sensory-instructions** — Avoid sensory-only instructions  
- 🟠 **session-timeout-recovery** — Prevent data loss from session timeouts  
- 🟠 **skip-navigation** — Include a skip navigation link  
- 🟠 **text-resizing** — Support text resizing to 200%  
- 🟠 **video-captions** — Provide captions for video content  
- 🟠 **viewport-zoom** — Do not disable pinch zoom  

## css (10 — 0 critical)

- 🟠 **animation-performance** — Use transform and opacity for animations  
- 🟠 **css-critical** — Inline critical CSS for faster rendering  
- 🟠 **css-custom-properties** — Use CSS custom properties for design tokens  
- 🟠 **css-minification** — Minify all CSS files  
- 🟠 **css-non-blocking** — Load CSS without blocking render  
- 🟠 **embedded-or-inline-css** — Avoid embedded and inline CSS  
- 🟠 **focus-styles** — Provide visible custom focus indicators  
- 🟠 **responsive-units** — Use relative units for responsive layouts  
- 🟠 **specificity-management** — Keep CSS specificity low and flat  
- 🟠 **unused-css** — Remove unused CSS rules  

## global (1 — 0 critical)

- 🟠 **frontend-checklist-global** — Front-End Checklist Global Audit  

## html (16 — 3 critical)

- 🔴 **charset** — Declare UTF-8 character encoding  
- 🔴 **doctype** — Use the HTML5 doctype  
- 🔴 **viewport** — Set the responsive viewport meta tag  
- 🟠 **accessible-notifications** — Make notifications accessible  
- 🟠 **defer-async** — Load scripts with defer, async, or type=module  
- 🟠 **form-validation** — Validate forms accessibly  
- 🟠 **html-resource-hints** — Add resource hints (preload, prefetch, dns-prefetch)  
- 🟠 **html5-semantic-elements** — Use semantic HTML elements  
- 🟠 **input-types** — Use semantic input type attributes  
- 🟠 **lang-attribute** — Set the page lang attribute  
- 🟠 **navigation-landmark** — Use navigation landmark regions  
- 🟠 **subresource-integrity** — Add Subresource Integrity to external scripts  
- 🟠 **unique-id** — Ensure all IDs are unique  
- 🟠 **video-accessibility** — Make videos accessible with captions  
- 🟠 **w3c-compliant** — Validate HTML against W3C standards  
- 🟠 **webpagetest** — Analyze performance with WebPageTest  

## images (16 — 1 critical)

- 🔴 **alt-text** — Provide meaningful alt text for images  
- 🟠 **broken-images** — Fix broken images  
- 🟠 **critical-images** — Prioritize loading critical images  
- 🟠 **dimensions** — Set explicit width and height on images  
- 🟠 **image-cdn** — Serve images from a CDN  
- 🟠 **image-compression** — Compress images without quality loss  
- 🟠 **image-file-size** — Keep image file sizes within recommended limits  
- 🟠 **image-optimization** — Optimize all images for web  
- 🟠 **modern-format** — Use modern image formats (WebP, AVIF)  
- 🟠 **offscreen-lazy** — Lazy load offscreen images  
- 🟠 **optimized** — Optimise images for faster loading  
- 🟠 **picture-element** — Use <picture> with an <img> fallback  
- 🟠 **responsive-images** — Implement responsive images with srcset  
- 🟠 **responsive-size** — Serve images at the correct display size  
- 🟠 **srcset** — Use srcset for responsive images  
- 🟠 **webp-format** — Use WebP format with fallbacks  

## javascript (13 — 1 critical)

- 🔴 **avoid-eval** — Never use eval() or unsafe dynamic code execution  
- 🟠 **code-splitting** — Split large JavaScript bundles  
- 🟠 **const-let** — Prefer const and let over var  
- 🟠 **cross-origin-security** — Handle cross-origin requests securely  
- 🟠 **debounce-throttle** — Debounce and throttle event handlers  
- 🟠 **dom-performance** — Minimize costly DOM read/write operations  
- 🟠 **error-handling** — Implement proper error handling  
- 🟠 **es-modules** — Use ES modules (import/export)  
- 🟠 **javascript-inline** — Avoid inline JavaScript  
- 🟠 **javascript-minification** — Minify all JavaScript files  
- 🟠 **memory-leaks** — Prevent common memory leak patterns  
- 🟠 **runtime-validation** — Validate external data at runtime with a schema library  
- 🟠 **typescript-strict-mode** — Enable TypeScript strict mode in tsconfig.json  

## performance (23 — 1 critical)

- 🔴 **largest-contentful-paint** — Optimize largest contentful paint  
- 🟠 **back-forward-cache** — Optimize pages for back/forward cache  
- 🟠 **browser-caching** — Enable browser caching  
- 🟠 **cdn** — Use a content delivery network  
- 🟠 **compression** — Enable text-based compression  
- 🟠 **consent-mode** — Implement Google Consent Mode v2  
- 🟠 **critical-request-chains** — Minimize critical request chains  
- 🟠 **cumulative-layout-shift** — Minimize cumulative layout shift  
- 🟠 **first-contentful-paint** — Optimize first contentful paint  
- 🟠 **font-loading** — Optimize web font loading  
- 🟠 **http-requests** — Minimize HTTP requests  
- 🟠 **http2** — Enable HTTP/2 or HTTP/3  
- 🟠 **import-on-interaction** — Load non-critical code on user interaction  
- 🟠 **import-on-visibility** — Load non-critical code when content approaches the viewport  
- 🟠 **interaction-to-next-paint** — Optimize interaction to next paint  
- 🟠 **lazy-loading** — Implement lazy loading for offscreen content  
- 🟠 **list-virtualization** — Virtualize long lists and tables  
- 🟠 **loading-indicators** — Show loading indicators  
- 🟠 **page-load-time** — Keep page load time under 3 seconds  
- 🟠 **page-weight** — Keep page weight under 1500KB  
- 🟠 **performance-resource-hints** — Use resource hints for faster loading  
- 🟠 **resource-hints** — Use resource hints for faster loading  
- 🟠 **third-party-scripts** — Optimize third-party script loading  

## privacy (2 — 0 critical)

- 🟠 **cookie-consent** — Show a cookie consent notice  
- 🟠 **privacy-policy** — Link to your privacy policy in the footer  

## security (14 — 4 critical)

- 🔴 **form-https** — Submit forms over HTTPS  
- 🔴 **http-to-https** — Redirect HTTP to HTTPS  
- 🔴 **https** — Serve all pages over HTTPS  
- 🔴 **leaked-secrets** — Leaked Environment Variables  
- 🟠 **content-security-policy** — Implement a content security policy  
- 🟠 **dependency-audit** — Audit dependencies for known vulnerabilities  
- 🟠 **hsts** — Set an HSTS header  
- 🟠 **mixed-content** — Avoid mixed content on HTTPS pages  
- 🟠 **password-field-security** — Secure password input fields  
- 🟠 **session-cookie-flags** — Set Secure, HttpOnly, and SameSite flags on session cookies  
- 🟠 **stack-trace-exposure** — Prevent stack trace exposure in production error responses  
- 🟠 **token-storage-security** — Store authentication tokens securely  
- 🟠 **x-content-type** — Set X-Content-Type-Options: nosniff  
- 🟠 **x-frame-options** — Set an X-Frame-Options header  

## seo (19 — 0 critical)

- 🟠 **article** — Implement valid Article structured data  
- 🟠 **broken-links** — Resolve internal broken links  
- 🟠 **canonical-url** — Set canonical URLs for all pages  
- 🟠 **meta-description** — Write a meta description for each page  
- 🟠 **meta-in-body** — Meta Tags in Body  
- 🟠 **meta-title** — Write a descriptive page title  
- 🟠 **noindex-in-sitemap** — Noindex in Sitemap  
- 🟠 **quality** — Publish high-quality content  
- 🟠 **redirect-chain** — Avoid multi-hop redirect chains  
- 🟠 **robots-meta** — Set robots meta directives correctly  
- 🟠 **robots-meta-conflict** — Robots Meta Conflict  
- 🟠 **robots-txt** — Publish a robots.txt file  
- 🟠 **schema-noindex-conflict** — Schema + Noindex Conflict  
- 🟠 **sitemap** — Create and submit an XML sitemap  
- 🟠 **sitemap-4xx** — 4XX Pages in Sitemap  
- 🟠 **sitemap-valid** — Keep XML sitemaps valid  
- 🟠 **structured-data** — Add structured data markup  
- 🟠 **title-unique** — Keep page titles unique  
- 🟠 **ymyl-detection** — Identify YMYL content on your site  

## testing (7 — 0 critical)

- 🟠 **accessibility-testing** — Include accessibility testing  
- 🟠 **cross-browser-testing** — Test across all major browsers  
- 🟠 **e2e-testing** — Implement end-to-end testing  
- 🟠 **error-monitoring** — Integrate real-time error monitoring in production  
- 🟠 **integration-testing** — Write integration tests for key workflows  
- 🟠 **mobile-testing** — Test on real mobile devices and viewports  
- 🟠 **unit-tests** — Write unit tests  

