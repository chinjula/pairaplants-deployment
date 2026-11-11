# Green Bed Aquatics – shop website

HTML + CSS + plain JavaScript frontend (`public/`) and an Express.js (Node.js) API (`server.js`).

## Run it
    npm install
    npm start          # http://localhost:3000

On the very first start, the terminal prints one random password each for `owner`, `manager` and `support`. Save them, then sign in at **Staff login** (footer link) and change them from Users → Reset password.

## Roles (enforced on the server, not just hidden in the page)
| Role | Can do |
|---|---|
| Super Admin (`owner`) | Everything: backups and restore, security log, user accounts and roles, products, plus all Manager and Support tools |
| Manager | Live stock updates, view orders, update order status |
| Customer Support | Read and resolve Contact Us inquiries, update stock |

## Pages
Home, Our Story, Shop, Cart (with checkout), Contact Us. Customers do not need an account.

## Data
Everything is stored in `data/db.json` (created on first run). Backups go to `data/backups/` (automatic every 24 hours, last 14 kept). Never commit the `data/` folder.

## Before going live
- Run behind HTTPS and start with `NODE_ENV=production` (adds the Secure cookie flag). Behind Nginx or a host proxy also set `TRUST_PROXY=1`.
- Optionally set `JWT_SECRET` and `PORT` as environment variables.
- The JSON file is fine for a small shop. If you grow, swap it for SQLite or MySQL.
- Online payments and email notifications are not included; orders are paid on delivery or by your own method.
