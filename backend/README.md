# WYATT XXX COLE - Backend API

Node.js/Express backend for the WXXXC website.

## Quick Start

```bash
# Install dependencies
npm install

# Initialize database with schema and seed data
npm run init-db

# Start development server
npm run dev

# Start production server
npm start
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

```env
PORT=3000
NODE_ENV=development
JWT_SECRET=your-secret-key
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-password

# Email (optional for development)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email
SMTP_PASS=your-password
EMAIL_FROM=noreply@wyattxxxcole.xxx
BOOKING_EMAIL=booking@wyattxxxcole.xxx

# Stripe (optional)
STRIPE_SECRET_KEY=sk_test_xxx
```

## API Endpoints

### Public Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/booking/studio-inquiry` | Submit studio booking |
| POST | `/api/booking/professional` | Submit professional booking |
| POST | `/api/contact/creator-collab` | Submit creator collab request |
| POST | `/api/contact/general` | Submit general contact form |
| GET | `/api/shop/products` | Get all products |
| GET | `/api/shop/products/:slug` | Get single product |
| POST | `/api/shop/orders` | Create order |
| POST | `/api/shop/newsletter` | Subscribe to newsletter |
| GET | `/api/schedule/calendar/:year/:month` | Get calendar availability |
| GET | `/api/schedule/cities` | Get upcoming cities |
| POST | `/api/schedule/notify` | Sign up for location notifications |
| GET | `/api/community/posts` | Get community posts |
| POST | `/api/community/posts/:id/like` | Like/unlike a post |
| POST | `/api/community/polls/:id/vote` | Vote on a poll |
| GET | `/api/portfolio/items` | Get portfolio items |

### Admin Endpoints (Requires Authentication)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Admin login |
| GET | `/api/auth/verify` | Verify token |
| GET | `/api/admin/stats` | Dashboard stats |
| GET | `/api/admin/bookings` | List bookings |
| PATCH | `/api/admin/bookings/:id` | Update booking status |
| GET | `/api/admin/collabs` | List creator collabs |
| GET | `/api/admin/orders` | List orders |
| PATCH | `/api/admin/orders/:id` | Update order status |
| GET/POST/PATCH/DELETE | `/api/admin/products` | Manage products |
| POST | `/api/admin/community/posts` | Create post |
| GET | `/api/admin/community/comments` | List comments |
| PATCH | `/api/admin/community/comments/:id` | Approve comment |
| POST | `/api/admin/schedule/availability` | Update availability |
| GET | `/api/admin/newsletter/subscribers` | List subscribers |

## Database

Uses SQLite for simplicity. Database file is stored at `data/database.sqlite`.

### Tables

- `admin_users` - Admin authentication
- `bookings` - Studio booking inquiries
- `creator_collabs` - Creator collaboration requests
- `contact_submissions` - General contact forms
- `products` - Shop products
- `orders` - Shop orders
- `newsletter_subscribers` - Email subscribers
- `schedule_availability` - Calendar availability
- `schedule_locations` - Tour cities
- `location_notifications` - City notification signups
- `community_posts` - Social feed posts
- `community_polls` - Post polls
- `poll_votes` - Poll vote tracking
- `post_likes` - Post like tracking
- `post_comments` - Post comments
- `portfolio_items` - Portfolio gallery items

## Default Admin Login

- Username: `admin`
- Password: `admin123` (change in production!)

## Project Structure

```
backend/
├── data/               # SQLite database
├── src/
│   ├── config/        # Database config
│   ├── middleware/    # Auth middleware
│   ├── routes/        # API routes
│   ├── utils/         # Email utilities
│   ├── init-db.js     # Database initialization
│   └── server.js      # Express app
├── .env.example       # Environment template
└── package.json
```
