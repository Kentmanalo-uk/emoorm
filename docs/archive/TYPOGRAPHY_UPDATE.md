# Typography System Update

## ✅ Updated to Match Typography Guide

### Font Sizes Applied

| Usage              | Size    | Weight | CSS Variable          |
| ------------------ | ------- | ------ | --------------------- |
| Display / Hero     | 40-48px | 700    | `--font-size-display` |
| Page Title (H1)    | 28-32px | 600    | `--font-size-h1`      |
| Section Title (H2) | 24px    | 600    | `--font-size-h2`      |
| Card Title (H3)    | 20px    | 600    | `--font-size-h3`      |
| Subheading (H4)    | 18px    | 600    | `--font-size-h4`      |
| Default Body       | 16px    | 400    | `--font-size-body`    |
| Secondary Text     | 15px    | 400    | `--font-size-secondary` |
| Small Text         | 14px    | 400    | `--font-size-small`   |
| Caption            | 12px    | 400    | `--font-size-caption` |
| Badge / Tiny       | 11px    | 500    | `--font-size-badge`   |

### CSS Variables Available

```css
/* Font Sizes */
--font-size-display: 48px;
--font-size-display-sm: 40px;
--font-size-h1: 32px;
--font-size-h1-sm: 28px;
--font-size-h2: 24px;
--font-size-h3: 20px;
--font-size-h4: 18px;
--font-size-body: 16px;
--font-size-secondary: 15px;
--font-size-small: 14px;
--font-size-caption: 12px;
--font-size-badge: 11px;

/* Font Weights */
--font-weight-normal: 400;
--font-weight-medium: 500;
--font-weight-semibold: 600;
--font-weight-bold: 700;
```

### Usage in Components

**Display / Hero Text:**
```jsx
<h1 className="text-display">Shop with Mindoro's Originals</h1>
```

**Page Title:**
```jsx
<h1 className="text-h1">Welcome to Emoorm</h1>
```

**Section Title:**
```jsx
<h2 className="text-h2">Shop by Category</h2>
```

**Card Title:**
```jsx
<h3 className="text-h3">Start selling today</h3>
```

**Body Text:**
```jsx
<p className="text-body">Default paragraph text</p>
```

**Secondary Text:**
```jsx
<p className="text-secondary">Supporting information</p>
```

**Small Text:**
```jsx
<span className="text-small">Additional details</span>
```

**Caption:**
```jsx
<span className="text-caption">Image caption or footnote</span>
```

**Badge:**
```jsx
<span className="text-badge">NEW</span>
```

### HTML Elements Auto-Styled

HTML elements automatically use the correct sizes:

```html
<h1>Page Title (28-32px, weight 600)</h1>
<h2>Section Title (24px, weight 600)</h2>
<h3>Card Title (20px, weight 600)</h3>
<h4>Subheading (18px, weight 600)</h4>
<p>Body text (16px, weight 400)</p>
```

### Responsive Behavior

On mobile (≤768px):
- Display text: 48px → 40px
- H1 text: 32px → 28px

### Files Updated

1. **web/src/styles/typography.css**
   - Complete rewrite with guide specifications
   - Added all CSS variables
   - Created utility classes
   - Added responsive rules

2. **web/src/index.css**
   - Updated HTML element styles
   - Applied correct font sizes

### Font Family

All text uses **Inter** font family from Google Fonts:
```css
--font-primary: 'Inter', -apple-system, BlinkMacSystemFont, ...
```

## Current System Status

✅ **Backend API**: http://localhost:3000/api
✅ **Frontend**: http://localhost:5173
✅ **Database**: MySQL connected
✅ **Typography**: Updated to guide specifications
✅ **Font**: Inter loaded and active

## What Changed

**Before:**
- Generic font sizes (xs, sm, base, lg, xl, 2xl, etc.)
- Inconsistent weights
- No clear hierarchy

**After:**
- Exact sizes from typography guide
- Specific weights (400, 500, 600, 700)
- Clear semantic naming
- Responsive scaling
- Professional hierarchy

The typography system now perfectly matches your guide with consistent sizing, proper weights, and semantic class names!
