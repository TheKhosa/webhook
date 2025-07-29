# Universal Webhook Forwarder

A robust Node.js service for receiving, parsing, and forwarding [KeyGen.SH](https://keygen.sh) webhooks—**both cloud and self-hosted**—to Microsoft Teams. Designed for flexibility, security, and extensibility, it supports over a dozen event categories, displays rich facts, and can run easily on platforms like [Render](https://render.com/) with free SSL-enabled hosting.

---

## Table of Contents

- [Features](#features)
- [KeyGen.SH Webhook Support](#keygensh-webhook-support)
- [Quick Start](#quick-start)
- [Deploy to Render (Free, SSL)](#deploy-to-render-free-ssl)
- [Environment Variables](#environment-variables)
- [Endpoints](#endpoints)
- [Supported Event Categories](#supported-event-categories)
- [Customization](#customization)
- [Error Handling](#error-handling)
- [Contributing](#contributing)
- [License](#license)
- [Author](#author)

---

## Features

- **Express.js REST API**: Fast, secure, and easy to extend.
- **Microsoft Teams Integration**: Sends formatted notifications to Teams channels.
- **Event Categorization**: Icon, color, and display name for each event.
- **Rich Fact Extraction**: Shows relevant details for licenses, users, machines, accounts, products, releases, and more.
- **Warning and Status Highlighting**: Critical events (expired, suspended, canceled, etc.) are visually emphasized.
- **Health and Event Listing**: Health check and event catalog endpoints for easy monitoring.
- **Graceful Shutdown**: Handles SIGINT/SIGTERM for safe server stops.
- **SSL Out-of-the-box**: Free SSL/HTTPS support on Render and similar platforms.

---

## KeyGen.SH Webhook Support

This service is purpose-built for [KeyGen.SH](https://keygen.sh) license management webhook events, supporting:

- **KeyGen Cloud Webhooks:** Use the webhook endpoint from your KeyGen cloud dashboard.
- **KeyGen Self-hosted Webhooks:** Point your self-hosted KeyGen webhook sender to this service.

The payloads and event types from both KeyGen cloud and self-hosted are supported, with automatic parsing of nested data and event metadata.

---

## Quick Start

### 1. Fork this Repository

> **Why fork?**  
> You need your own copy to deploy, set secrets, and make customizations.

- Go to the repo: [https://github.com/TheKhosa/webhook](https://github.com/TheKhosa/webhook)
- Click **Fork** (top right).
- Use your GitHub account as the destination.

### 2. Local Setup (Optional)

```bash
git clone https://github.com/<your-username>/webhook.git
cd webhook
npm install
```

### 3. Add Environment Variables

Create a `.env` file in the root directory:

```env
TEAMS_WEBHOOK_URL=your_ms_teams_webhook_url
PORT=3000            # Optional (default: 3000)
NODE_ENV=production  # Optional (default: development)
```

### 4. Start the Service

```bash
npm start
```

---

## Deploy to Render (Free, SSL)

1. **Log into [Render](https://render.com/)**  
   Create an account if needed.

2. **Create a New Web Service:**  
   - Click **“New +” → “Web Service”**
   - Connect your GitHub account.
   - Select your forked repo.

3. **Set Build & Start Commands:**  
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`

4. **Set Environment Variables:**  
   - Add at least:  
     - `TEAMS_WEBHOOK_URL` (your Teams webhook URL)
     - `NODE_ENV` (optional, recommended: `production`)

5. **Choose the Free Plan:**  
   - Render’s free web service instance will automatically provide SSL/HTTPS.

6. **Access Your Service:**  
   - Your webhook endpoint will be:  
     `https://your-app.onrender.com/webhook`

---

## Environment Variables

| Variable           | Required | Description                                   |
|--------------------|----------|-----------------------------------------------|
| TEAMS_WEBHOOK_URL  | Yes      | Your MS Teams incoming webhook URL            |
| PORT               | No       | Port to listen on (Render sets this for you)  |
| NODE_ENV           | No       | `production` or `development`                 |

---

## Endpoints

| Endpoint       | Method | Description                                                                                  |
|----------------|--------|---------------------------------------------------------------------------------------------|
| `/webhook`     | POST   | Receives and parses webhook payload; forwards notification to Teams.                        |
| `/health`      | GET    | Service health, status, and configuration info.                                             |
| `/events`      | GET    | Lists all supported event categories and their events.                                      |
| `/`            | GET    | Service overview, endpoints, and supported event count.                                     |
| `*`            | Any    | 404 handler for unknown endpoints.                                                          |

---

## Supported Event Categories

> Over 100 events in 15+ categories, each with its own icon and color.

- **account**: Billing, plan, subscription, updates
- **artifact**: Created, deleted, downloaded, uploaded
- **component**
- **entitlement**
- **group**
- **license**: Expiry, suspension, validation, usage
- **machine**
- **package**
- **policy**
- **process**
- **product**
- **release**
- **second-factor**
- **token**
- **user**

For a full list, GET `/events`.

---

## Customization

- **Add or edit supported events:**  
  Update `EVENT_CATEGORIES` in `server.js`.
- **Change display logic or facts:**  
  Extend `FACT_EXTRACTORS` for new object types.
- **Customize Teams notifications:**  
  Tweak `createTeamsMessageCard()` for card layout, icons, and links.

---

## Error Handling

- Logs errors and warnings to the console.
- Returns JSON error details for invalid requests or server errors.
- Graceful handling of shutdown signals and unknown endpoints.

---

## Contributing

Pull requests and issues are welcome!  
Feel free to suggest new features, categories, or improvements.

---

## License

MIT

---

## Author

[TheKhosa](https://github.com/TheKhosa)

---
