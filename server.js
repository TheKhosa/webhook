const express = require('express');
const axios = require('axios');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const app = express();

// Security middleware
app.use(helmet());
app.use(cors());

// MS Teams webhook URL from environment
const TEAMS_WEBHOOK_URL = process.env.TEAMS_WEBHOOK_URL;

// Validate required environment variables
if (!TEAMS_WEBHOOK_URL) {
  console.error('ERROR: TEAMS_WEBHOOK_URL environment variable is required');
  process.exit(1);
}

app.use(express.json());

// Function to parse the nested payload
function parseWebhookPayload(webhookData) {
  try {
    // The actual license data is in the payload string, need to parse it
    const payload = JSON.parse(webhookData.data.attributes.payload);
    return {
      event: webhookData.data.attributes.event,
      licenseData: payload.data,
      webhookMeta: webhookData.data.attributes
    };
  } catch (error) {
    console.error('Error parsing webhook payload:', error);
    return null;
  }
}

// Function to format timestamp
function formatTimestamp(timestamp) {
  if (!timestamp) return 'N/A';
  return new Date(timestamp).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC'
  }) + ' UTC';
}

// Function to get status color based on event type
function getStatusColor(event, status) {
  if (event.includes('decremented') || event.includes('revoked')) {
    return 'attention'; // Orange/yellow for usage changes
  }
  if (status === 'ACTIVE') {
    return 'good'; // Green for active
  }
  if (status === 'SUSPENDED') {
    return 'warning'; // Red for suspended
  }
  return 'default'; // Blue for other events
}

// Function to create MS Teams message card
function createTeamsMessageCard(parsedData) {
  const { event, licenseData, webhookMeta } = parsedData;
  const license = licenseData.attributes;
  
  // Create a more readable event name
  const eventDisplayName = event
    .replace(/\./g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  const messageCard = {
    "@type": "MessageCard",
    "@context": "https://schema.org/extensions",
    "summary": `License ${eventDisplayName}`,
    "themeColor": getStatusColor(event, license.status) === 'good' ? '28a745' : 
                  getStatusColor(event, license.status) === 'attention' ? 'ffc107' : 
                  getStatusColor(event, license.status) === 'warning' ? 'dc3545' : '007bff',
    "sections": [
      {
        "activityTitle": `🔑 License ${eventDisplayName}`,
        "activitySubtitle": `License Key: ${license.key}`,
        "activityImage": "https://img.icons8.com/fluency/48/license.png",
        "facts": [
          {
            "name": "Status",
            "value": license.status
          },
          {
            "name": "Uses",
            "value": license.uses?.toString() || '0'
          },
          {
            "name": "Max Machines",
            "value": license.maxMachines?.toString() || 'Unlimited'
          },
          {
            "name": "Last Validated",
            "value": formatTimestamp(license.lastValidated)
          },
          {
            "name": "Created",
            "value": formatTimestamp(license.created)
          },
          {
            "name": "Event Time",
            "value": formatTimestamp(webhookMeta.created)
          }
        ],
        "markdown": true
      }
    ],
    "potentialAction": [
      {
        "@type": "OpenUri",
        "name": "View License Details",
        "targets": [
          {
            "os": "default",
            "uri": `https://app.keygen.sh/accounts/${licenseData.relationships.account.data.id}/licenses/${licenseData.id}`
          }
        ]
      }
    ]
  };

  // Add additional context for specific events
  if (event.includes('usage')) {
    messageCard.sections[0].facts.unshift({
      "name": "Usage Event",
      "value": event.includes('incremented') ? '⬆️ Usage Increased' : '⬇️ Usage Decreased'
    });
  }

  // Add warning section for suspended licenses
  if (license.status === 'SUSPENDED' || license.suspended) {
    messageCard.sections.push({
      "activityTitle": "⚠️ License Suspended",
      "activitySubtitle": "This license is currently suspended and may not function properly.",
      "markdown": true
    });
  }

  // Add machine info if available
  const machineCount = licenseData.relationships.machines?.meta?.count;
  const coreCount = licenseData.relationships.machines?.meta?.cores;
  if (machineCount !== undefined || coreCount !== undefined) {
    messageCard.sections[0].facts.push({
      "name": "Machines",
      "value": `${machineCount || 0} machines, ${coreCount || 0} cores`
    });
  }

  return messageCard;
}

// Main webhook endpoint
app.post('/webhook', async (req, res) => {
  try {
    console.log(`[${new Date().toISOString()}] Webhook received from IP: ${req.ip}`);
    
    // Log webhook data in development
    if (process.env.NODE_ENV !== 'production') {
      console.log('Webhook payload:', JSON.stringify(req.body, null, 2));
    }
    
    // Parse the webhook data
    const parsedData = parseWebhookPayload(req.body);
    if (!parsedData) {
      console.error('Failed to parse webhook data');
      return res.status(400).json({ 
        error: 'Invalid webhook data', 
        timestamp: new Date().toISOString() 
      });
    }

    // Create Teams message card
    const teamsMessage = createTeamsMessageCard(parsedData);
    
    console.log(`[${new Date().toISOString()}] Forwarding ${parsedData.event} event for license ${parsedData.licenseData.attributes.key}`);

    // Forward to MS Teams
    const response = await axios.post(TEAMS_WEBHOOK_URL, teamsMessage, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Webhook-Forwarder/1.0'
      },
      timeout: 10000 // 10 second timeout
    });

    console.log(`[${new Date().toISOString()}] Teams notification sent successfully (${response.status})`);
    
    res.json({ 
      received: true, 
      forwarded: true,
      teamsStatus: response.status,
      event: parsedData.event,
      licenseKey: parsedData.licenseData.attributes.key,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error processing webhook:`, error.message);
    
    // Log full error in development
    if (process.env.NODE_ENV !== 'production') {
      console.error('Full error:', error);
    }
    
    // Still respond with success to the webhook sender to prevent retries
    res.json({ 
      received: true, 
      forwarded: false, 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    teamsConfigured: !!TEAMS_WEBHOOK_URL
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Webhook Forwarder',
    status: 'running',
    timestamp: new Date().toISOString(),
    endpoints: {
      webhook: '/webhook (POST)',
      health: '/health (GET)'
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error(`[${new Date().toISOString()}] Unhandled error:`, error);
  res.status(500).json({
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// Start server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Webhook forwarder listening on port ${PORT}`);
  console.log(`📅 Started at: ${new Date().toISOString()}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✅ Teams webhook configured: ${!!TEAMS_WEBHOOK_URL}`);
  if (TEAMS_WEBHOOK_URL) {
    console.log(`🔗 Teams URL: ${TEAMS_WEBHOOK_URL.substring(0, 50)}...`);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});

module.exports = app;
