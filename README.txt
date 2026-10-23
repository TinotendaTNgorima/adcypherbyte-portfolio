ADCYPHERBYTEBYTE PORTFOLIO — BEGINNER SETUP
===================================

What this starter provides
- Public portfolio page with project cards and YouTube embeds.
- Admin page at /portfolio/admin
- Password-protected admin login.
- Add, edit, and delete portfolio projects/videos.
- Cloudflare Pages + Pages Functions + D1 database.
- Designed for a Cloudflare free-tier setup (subject to current account limits).

IMPORTANT
- This starter expects the site to be served under /portfolio.
- Do not share your admin password or Cloudflare API tokens.
- Before using for business-critical content, test it and keep a backup of your D1 data.
- If adcypher.com already has a website, do not change its root DNS records. Use a specific Worker route or a carefully configured Pages/Worker routing setup for /portfolio.

RECOMMENDED PATH FOR A BEGINNER
1. Create a GitHub account at https://github.com/ if you don't already have one.
2. Create a new repository named adcypherbyte-portfolio.
3. Upload all files/folders in this ZIP to the repository.
4. In Cloudflare Dashboard, open Workers & Pages > Create > Pages > Connect to Git.
   Choose the repository. Build command: leave blank; output directory: public.
5. Add a D1 database:
   Cloudflare Dashboard > Storage & databases > D1 SQL Database > Create database.
   Name it: adcypherbyte-portfolio-db
6. Open the database's Console and run the SQL in schema.sql.
7. In your Pages project, Settings > Functions > D1 database bindings:
   Variable name: DB
   Select database: adcypherbyte-portfolio-db
8. In Pages project Settings > Variables and Secrets, add:
   ADMIN_PASSWORD = choose a long unique password
   SESSION_SECRET = a long random secret (at least 32 characters)
   BASE_PATH = /portfolio
   Mark ADMIN_PASSWORD and SESSION_SECRET as secrets if the dashboard offers that option.
9. Deploy the project and test its temporary *.pages.dev address first.
10. Connect it to adcypher.com/portfolio only after confirming how the main domain is currently hosted. A Pages custom domain normally connects to a hostname, not a path. To serve only /portfolio on an existing domain, use a Worker route such as adcypher.com/portfolio* and have the Worker/Pages routing forward the path correctly, or configure the existing site's router. Do not blindly attach adcypher.com as a Pages custom domain if you already have a live root website.

ROUTES
- Public: /portfolio
- Admin:  /portfolio/admin
- Login API: /portfolio/api/login
- Logout API: /portfolio/api/logout
- Projects API: /portfolio/api/projects

NOTE ABOUT ROUTING
Cloudflare Pages Functions route by file path within the Pages project. For the easiest first test, deploy to the pages.dev URL and test the pages at /portfolio. If your Pages deployment is hosted at the root of its pages.dev hostname, a path prefix rewrite may be needed. The project includes a _redirects file to make /portfolio the intended entry point. For production path routing on a domain that already has a site, follow Cloudflare's Worker Routes documentation and preserve the /portfolio prefix.

OFFICIAL DOCUMENTATION
Cloudflare Pages: https://developers.cloudflare.com/pages/
Pages Functions: https://developers.cloudflare.com/pages/functions/
D1: https://developers.cloudflare.com/d1/
Worker Routes: https://developers.cloudflare.com/workers/configuration/routing/
