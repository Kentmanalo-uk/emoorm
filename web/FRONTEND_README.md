# E-MOORM Frontend

React.js frontend application for E-MOORM (E-commerce platform for Oriental Mindoro).

## Tech Stack

- **Framework**: React 19 + Vite
- **Routing**: React Router DOM
- **State Management**: Zustand
- **Data Fetching**: TanStack Query (React Query)
- **Forms**: React Hook Form
- **HTTP Client**: Axios
- **Icons**: Lucide React
- **Styling**: CSS Modules with CSS Variables

## Project Structure

```
web/
├── src/
│   ├── components/
│   │   ├── ui/           # Reusable UI components (Button, Input, Card, etc.)
│   │   └── layout/       # Layout components (Header, Footer, Layout)
│   ├── pages/            # Page components
│   ├── store/            # Zustand stores (auth, cart, etc.)
│   ├── lib/              # Libraries and utilities (axios instance)
│   ├── config/           # Configuration files (API endpoints)
│   ├── styles/           # Global styles and design tokens
│   ├── hooks/            # Custom React hooks
│   ├── utils/            # Utility functions
│   ├── App.jsx           # Main app component
│   ├── main.jsx          # App entry point
│   └── index.css         # Global styles
├── public/               # Static assets
├── .env                  # Environment variables
└── package.json
```

## Design System

The design system follows the UI/UX guide provided with:

### Color Palette
- **Primary**: Green (#22c55e) - main brand color
- **Secondary**: Dark green (#059669)
- **Accent**: Orange (#fb923c), Red (#ef4444), Yellow (#fbbf24)
- **Neutral**: Gray scale from 50-900
- **Status**: Success, Warning, Error, Info colors

### Typography
- **Font Family**: System font stack (San Francisco, Segoe UI, Roboto)
- **Sizes**: xs (12px) to 6xl (60px)
- **Weights**: Normal (400), Medium (500), Semibold (600), Bold (700), Extrabold (800)

### Spacing
- Based on 4px scale (1-32 units)
- Container max-widths: sm (640px) to 2xl (1536px)
- Border radius: sm (2px) to full (circular)

### Components
All components follow the design guide:
- Buttons: Primary, Secondary, Outline, Ghost, Danger, Link variants
- Inputs: With label, error states, icons
- Cards: With header, body, footer sections
- Header: With search, cart, notifications, user menu
- Footer: Comprehensive with links and contact info

## Getting Started

### Prerequisites
- Node.js 18+ and npm

### Installation

```bash
# Install dependencies
npm install
```

### Environment Setup

Create a `.env` file in the root:

```env
VITE_API_URL=http://localhost:3000/api
VITE_APP_NAME=Emoorm
```

### Development

```bash
# Start development server
npm run dev

# The app will run on http://localhost:5173
```

### Build

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

## State Management

### Auth Store (Zustand)
Manages authentication state:
- User data
- Access & refresh tokens
- Login/logout actions
- Role checks (isBuyer, isSeller, isAdmin)

### Cart Store (Zustand)
Manages shopping cart:
- Cart items
- Add/remove/update items
- Calculate totals
- Group by store

## API Integration

### Axios Instance
Pre-configured axios instance with:
- Base URL from environment
- Request interceptor for auth tokens
- Response interceptor for error handling
- Automatic token refresh on 401

### React Query
Used for data fetching with:
- Automatic caching
- Background refetching
- Optimistic updates
- Loading and error states

## Component Usage

### Button
```jsx
import Button from './components/ui/Button';

<Button variant="primary" size="md" onClick={handleClick}>
  Click Me
</Button>
```

### Input
```jsx
import Input from './components/ui/Input';

<Input
  label="Email"
  type="email"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
  error={errors.email}
  required
/>
```

### Card
```jsx
import Card from './components/ui/Card';

<Card hoverable onClick={handleClick}>
  <Card.Header>Title</Card.Header>
  <Card.Body>Content</Card.Body>
  <Card.Footer>Footer</Card.Footer>
</Card>
```

## Routing

Main routes:
- `/` - Home page
- `/login` - Login page
- `/register` - Registration page
- `/products` - Product listing
- `/product/:id` - Product details
- `/cart` - Shopping cart
- `/checkout` - Checkout
- `/profile` - User profile
- `/orders` - Order history
- `/seller/*` - Seller dashboard routes
- `/admin/*` - Admin dashboard routes

## Best Practices

1. **Components**: Small, reusable, single responsibility
2. **State**: Use Zustand for global state, useState for local
3. **Styling**: Follow design system CSS variables
4. **API Calls**: Use React Query hooks
5. **Forms**: Use React Hook Form for validation
6. **Error Handling**: Show user-friendly error messages
7. **Loading States**: Show loaders during async operations
8. **Accessibility**: Semantic HTML, ARIA labels, keyboard navigation

## Responsive Design

Breakpoints:
- Mobile: < 640px
- Tablet: 640px - 1024px
- Desktop: > 1024px

All components are mobile-first and responsive.

## Browser Support

- Chrome (latest 2 versions)
- Firefox (latest 2 versions)
- Safari (latest 2 versions)
- Edge (latest 2 versions)

## Contributing

1. Follow the design system
2. Write reusable components
3. Add proper TypeScript types (if migrating)
4. Test on multiple devices
5. Follow naming conventions

## License

Proprietary - E-MOORM Platform
