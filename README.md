# Warrantiq — Product Warranty & After-Sales Service Management System

A full-stack BCA project built with HTML, CSS, JavaScript, Node.js, Express, and MongoDB.

## Features

### Customer
- Register and sign in
- Register purchased products and warranty periods
- Automatic warranty expiry calculation and active/expired status
- Submit service requests and receive a ticket number
- View request status and admin notes
- Delete a product and its related requests

### Admin
- Separate admin account configured through environment variables
- View all registered products and customer service requests
- View summary counts
- Update request status (Submitted, In Progress, Resolved, Rejected)
- Add a note for the customer

## Requirements

- Node.js 18 or newer
- MongoDB Community Server running locally, or a MongoDB Atlas connection string
- Internet access during the first `npm install`

## Setup on Windows

1. Install Node.js LTS from https://nodejs.org/ and MongoDB Community Server from https://www.mongodb.com/try/download/community, or create a free MongoDB Atlas cluster at https://www.mongodb.com/atlas.
2. Extract this ZIP to a folder, for example `C:\BCA\product-warranty-management-system`.
3. Open that folder in VS Code.
4. Open a terminal in VS Code (`Terminal` → `New Terminal`).
5. Install dependencies:

   ```bash
   npm install
   ```

6. Copy `.env.example` to a new file named `.env`.
   - In VS Code, right-click `.env.example` → Copy, then paste and rename the copy to `.env`.
   - Edit `.env` and set a long random `JWT_SECRET` (at least 24 characters).
   - Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` to credentials you choose.
   - If MongoDB is running locally, keep `MONGODB_URI=mongodb://127.0.0.1:27017/warranty_management`.
   - If using Atlas, replace `MONGODB_URI` with your Atlas connection string. Do not share your connection string or commit `.env`.
7. Ensure the MongoDB service is running if using a local database.
8. Start the application:

   ```bash
   npm start
   ```

9. Open **http://localhost:3000** in Chrome.

For development with automatic server restarts, run `npm run dev`.

## First login

- Create a customer account using **Create account** on the website.
- Admin credentials are the `ADMIN_EMAIL` and `ADMIN_PASSWORD` values in `.env`.
- On first startup, the server creates the admin user if it does not exist. If the configured admin email already exists as a customer, the startup routine promotes that account to admin.

## MongoDB Atlas quick setup

1. Create a free cluster in Atlas.
2. Create a database user with a strong password.
3. Add your current IP address in Network Access.
4. Select Connect → Drivers → Node.js and copy the connection string.
5. Replace `<password>` and the database part in `MONGODB_URI`, for example:
   `mongodb+srv://YOUR_DB_USER:YOUR_DB_PASSWORD@YOUR_CLUSTER.mongodb.net/warranty_management?retryWrites=true&w=majority`
6. Keep credentials private. Special characters in a database password must be URL-encoded.

## Main folder structure

```text
product-warranty-management-system/
├── public/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── .env.example
├── .gitignore
├── package.json
├── server.js
└── README.md
```

## API endpoints

| Method | Endpoint | Purpose | Access |
|---|---|---|---|
| GET | `/api/health` | Check server/database status | Public |
| POST | `/api/auth/register` | Create customer account | Public |
| POST | `/api/auth/login` | Sign in | Public |
| GET | `/api/auth/me` | Current user | Logged in |
| GET | `/api/products` | List products | Logged in |
| POST | `/api/products` | Register product | Logged in |
| DELETE | `/api/products/:id` | Delete product | Owner or admin |
| GET | `/api/requests` | List service requests | Logged in |
| POST | `/api/requests` | Submit service request | Logged in |
| PATCH | `/api/requests/:id/status` | Update request status | Admin |
| GET | `/api/admin/summary` | Dashboard counts | Admin |

## Suggested testing checklist

1. Register a customer account.
2. Log in and register a laptop with a purchase date and 12-month warranty.
3. Confirm the expiry date and warranty status are displayed.
4. Submit a service request and note the ticket number.
5. Log out and sign in with the admin credentials from `.env`.
6. Update the service request to **In Progress**, add an admin note, and save.
7. Sign back in as the customer and verify the status and note.
8. Try a second product and confirm the dashboard counts update.

## Important notes

- This is an academic demonstration project. Before production use, add features such as email verification, password reset, audit logging, automated tests, stronger session/token handling, and deployment-specific security settings.
- The demo stores the JWT in browser local storage. For production, consider secure, HTTP-only cookies and a reviewed authentication design.
- Do not use real customer data for a college demonstration.
- Never upload your `.env` file to GitHub or share admin credentials.
