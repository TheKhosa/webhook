const express = require('express');
const axios = require('axios');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const app = express();

// Security middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// MS Teams webhook URL from environment
const TEAMS_WEBHOOK_URL = process.env.TEAMS_WEBHOOK_URL;

// Validate required environment variables
if (!TEAMS_WEBHOOK_URL) {
  console.error('ERROR: TEAMS_WEBHOOK_URL environment variable is required');
  process.exit(1);
}

// Event category mappings with icons and colors
const EVENT_CATEGORIES = {
  account: {
    icon: '🏢',
    baseColor: '007bff',
    events: [
      'account.billing.updated', 'account.plan.updated', 'account.subscription.canceled',
      'account.subscription.paused', 'account.subscription.renewed', 'account.subscription.resumed',
      'account.updated'
    ]
  },
  artifact: {
    icon: '📦',
    baseColor: '6f42c1',
    events: [
      'artifact.created', 'artifact.deleted', 'artifact.downloaded', 'artifact.updated',
      'artifact.upload.processing', 'artifact.upload.succeeded', 'artifact.upload.failed',
      'artifact.uploaded'
    ]
  },
  component: {
    icon: '🧩',
    baseColor: '20c997',
    events: ['component.created', 'component.deleted', 'component.updated']
  },
  entitlement: {
    icon: '🎟️',
    baseColor: 'fd7e14',
    events: ['entitlement.created', 'entitlement.deleted', 'entitlement.updated']
  },
  group: {
    icon: '👥',
    baseColor: '6c757d',
    events: [
      'group.created', 'group.deleted', 'group.owners.attached',
      'group.owners.detached', 'group.updated'
    ]
  },
  license: {
    icon: '🔑',
    baseColor: '28a745',
    events: [
      'license.check-in-overdue', 'license.check-in-required-soon', 'license.checked-in',
      'license.checked-out', 'license.created', 'license.deleted', 'license.entitlements.attached',
      'license.entitlements.detached', 'license.expired', 'license.expiring-soon',
      'license.group.updated', 'license.policy.updated', 'license.reinstated',
      'license.renewed', 'license.revoked', 'license.suspended', 'license.updated',
      'license.usage.decremented', 'license.usage.incremented', 'license.usage.reset',
      'license.owner.updated', 'license.users.attached', 'license.users.detached',
      'license.validation.failed', 'license.validation.succeeded'
    ]
  },
  machine: {
    icon: '🖥️',
    baseColor: '17a2b8',
    events: [
      'machine.checked-out', 'machine.created', 'machine.deleted', 'machine.group.updated',
      'machine.owner.updated', 'machine.heartbeat.dead', 'machine.heartbeat.ping',
      'machine.heartbeat.reset', 'machine.heartbeat.resurrected', 'machine.updated'
    ]
  },
  package: {
    icon: '📄',
    baseColor: 'e83e8c',
    events: ['package.created', 'package.deleted', 'package.updated']
  },
  policy: {
    icon: '📋',
    baseColor: 'ffc107',
    events: [
      'policy.created', 'policy.deleted', 'policy.entitlements.attached',
      'policy.entitlements.detached', 'policy.pool.popped', 'policy.updated'
    ]
  },
  process: {
    icon: '⚙️',
    baseColor: 'dc3545',
    events: [
      'process.created', 'process.deleted', 'process.heartbeat.dead',
      'process.heartbeat.ping', 'process.heartbeat.resurrected', 'process.updated'
    ]
  },
  product: {
    icon: '🛍️',
    baseColor: '795548',
    events: ['product.created', 'product.deleted', 'product.updated']
  },
  release: {
    icon: '🚀',
    baseColor: '9c27b0',
    events: [
      'release.constraints.attached', 'release.constraints.detached', 'release.created',
      'release.deleted', 'release.package.updated', 'release.published',
      'release.updated', 'release.upgraded', 'release.yanked'
    ]
  },
  'second-factor': {
    icon: '🔐',
    baseColor: '607d8b',
    events: [
      'second-factor.created', 'second-factor.deleted', 'second-factor.disabled',
      'second-factor.enabled'
    ]
  },
  token: {
    icon: '🔒',
    baseColor: '795548',
    events: ['token.generated', 'token.regenerated', 'token.revoked']
  },
  user: {
    icon: '👤',
    baseColor: '3f51b5',
    events: [
      'user.banned', 'user.created', 'user.deleted', 'user.group.updated',
      'user.password-reset', 'user.unbanned', 'user.updated'
    ]
  }
};

// Event-specific color overrides for status indication
const EVENT_COLOR_OVERRIDES = {
  // Red for destructive/negative events
  'dc3545': [
    'deleted', 'failed', 'expired', 'revoked', 'suspended', 'banned', 
    'dead', 'overdue', 'canceled', 'yanked'
  ],
  // Yellow/Orange for warnings
  'ffc107': [
    'expiring-soon', 'check-in-required-soon', 'paused', 'processing', 
    'disabled', 'detached'
  ],
  // Green for positive events
  '28a745': [
    'created', 'succeeded', 'renewed', 'resumed', 'reinstated', 
    'resurrected', 'enabled', 'published', 'attached', 'unbanned'
  ]
};

// Function to get event category and metadata
function getEventMetadata(eventName) {
  for (const [category, config] of Object.entries(EVENT_CATEGORIES)) {
    if (config.events.includes(eventName)) {
      // Check for color overrides based on event action
      let color = config.baseColor;
      for (const [overrideColor, keywords] of Object.entries(EVENT_COLOR_OVERRIDES)) {
        if (keywords.some(keyword => eventName.includes(keyword))) {
          color = overrideColor;
          break;
        }
      }
      
      return {
        category,
        icon: config.icon,
        color,
        displayName: formatEventName(eventName)
      };
    }
  }
  
  // Fallback for unknown events
  return {
    category: 'unknown',
    icon: '📡',
    color: '6c757d',
    displayName: formatEventName(eventName)
  };
}

// Function to format event names for display
function formatEventName(eventName) {
  return eventName
    .replace(/\./g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Function to parse the nested payload
function parseWebhookPayload(webhookData) {
  try {
    const payload = JSON.parse(webhookData.data.attributes.payload);
    return {
      event: webhookData.data.attributes.event,
      data: payload.data,
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

// Generic fact extractors for different object types
const FACT_EXTRACTORS = {
  // Common fields across most objects
  common: (obj) => [
    { name: 'Status', value: obj.status || 'N/A' },
    { name: 'Created', value: formatTimestamp(obj.created) },
    { name: 'Updated', value: formatTimestamp(obj.updated) }
  ],
  
  // License-specific facts
  license: (obj) => [
    { name: 'License Key', value: obj.key || 'N/A' },
    { name: 'Status', value: obj.status || 'N/A' },
    { name: 'Uses', value: obj.uses?.toString() || '0' },
    { name: 'Max Machines', value: obj.maxMachines?.toString() || 'Unlimited' },
    { name: 'Max Users', value: obj.maxUsers?.toString() || 'Unlimited' },
    { name: 'Suspended', value: obj.suspended ? 'Yes' : 'No' },
    { name: 'Last Validated', value: formatTimestamp(obj.lastValidated) },
    { name: 'Expiry', value: formatTimestamp(obj.expiry) },
    { name: 'Created', value: formatTimestamp(obj.created) }
  ],
  
  // User-specific facts
  user: (obj) => [
    { name: 'Email', value: obj.email || 'N/A' },
    { name: 'First Name', value: obj.firstName || 'N/A' },
    { name: 'Last Name', value: obj.lastName || 'N/A' },
    { name: 'Status', value: obj.status || 'N/A' },
    { name: 'Created', value: formatTimestamp(obj.created) },
    { name: 'Updated', value: formatTimestamp(obj.updated) }
  ],
  
  // Machine-specific facts
  machine: (obj) => [
    { name: 'Name', value: obj.name || 'N/A' },
    { name: 'Platform', value: obj.platform || 'N/A' },
    { name: 'Hostname', value: obj.hostname || 'N/A' },
    { name: 'Cores', value: obj.cores?.toString() || 'N/A' },
    { name: 'IP', value: obj.ip || 'N/A' },
    { name: 'Heartbeat Status', value: obj.heartbeatStatus || 'N/A' },
    { name: 'Last Ping', value: formatTimestamp(obj.lastPing) },
    { name: 'Created', value: formatTimestamp(obj.created) }
  ],
  
  // Account-specific facts
  account: (obj) => [
    { name: 'Name', value: obj.name || 'N/A' },
    { name: 'Slug', value: obj.slug || 'N/A' },
    { name: 'Plan', value: obj.plan || 'N/A' },
    { name: 'Billing Status', value: obj.billingStatus || 'N/A' },
    { name: 'Created', value: formatTimestamp(obj.created) },
    { name: 'Updated', value: formatTimestamp(obj.updated) }
  ],
  
  // Product-specific facts
  product: (obj) => [
    { name: 'Name', value: obj.name || 'N/A' },
    { name: 'URL', value: obj.url || 'N/A' },
    { name: 'Distribution Strategy', value: obj.distributionStrategy || 'N/A' },
    { name: 'Platforms', value: obj.platforms?.join(', ') || 'N/A' },
    { name: 'Created', value: formatTimestamp(obj.created) },
    { name: 'Updated', value: formatTimestamp(obj.updated) }
  ],
  
  // Release-specific facts
  release: (obj) => [
    { name: 'Version', value: obj.version || 'N/A' },
    { name: 'Channel', value: obj.channel || 'N/A' },
    { name: 'Status', value: obj.status || 'N/A' },
    { name: 'Tag', value: obj.tag || 'N/A' },
    { name: 'Created', value: formatTimestamp(obj.created) },
    { name: 'Updated', value: formatTimestamp(obj.updated) }
  ],
  
  // Generic extractor for other types
  generic: (obj) => [
    { name: 'ID', value: obj.id || 'N/A' },
    { name: 'Name', value: obj.name || obj.title || 'N/A' },
    { name: 'Type', value: obj.type || 'N/A' },
    { name: 'Status', value: obj.status || 'N/A' },
    { name: 'Created', value: formatTimestamp(obj.created) },
    { name: 'Updated', value: formatTimestamp(obj.updated) }
  ]
};

// Function to extract relevant facts based on object type
function extractFacts(data, eventCategory) {
  const obj = data.attributes || data;
  const extractor = FACT_EXTRACTORS[eventCategory] || FACT_EXTRACTORS.generic;
  
  return extractor(obj).filter(fact => 
    fact.value !== 'N/A' && fact.value !== null && fact.value !== undefined && fact.value !== ''
  );
}

// Function to generate dashboard URL
function generateDashboardUrl(data, eventCategory) {
  const accountId = data.relationships?.account?.data?.id;
  const objectId = data.id;
  
  if (!accountId || !objectId) return null;
  
  const baseUrl = 'https://app.keygen.sh';
  const categoryMap = {
    license: 'licenses',
    user: 'users',
    machine: 'machines',
    product: 'products',
    release: 'releases',
    policy: 'policies',
    token: 'tokens',
    group: 'groups',
    entitlement: 'entitlements',
    component: 'components',
    artifact: 'artifacts',
    package: 'packages',
    process: 'processes',
    account: ''
  };
  
  const path = categoryMap[eventCategory];
  if (eventCategory === 'account') {
    return `${baseUrl}/accounts/${accountId}`;
  }
  
  return path ? `${baseUrl}/accounts/${accountId}/${path}/${objectId}` : null;
}

// Function to create warning sections for critical events
function createWarningSection(eventName, data) {
  const warnings = [];
  
  // License warnings
  if (eventName.includes('license')) {
    const attrs = data.attributes;
    if (eventName.includes('expired')) {
      warnings.push({
        title: '⚠️ License Expired',
        subtitle: 'This license has expired and is no longer valid.',
        color: 'dc3545'
      });
    } else if (eventName.includes('expiring-soon')) {
      warnings.push({
        title: '⏰ License Expiring Soon',
        subtitle: 'This license will expire within the next 3 days.',
        color: 'ffc107'
      });
    } else if (eventName.includes('suspended') || attrs?.suspended) {
      warnings.push({
        title: '🚫 License Suspended',
        subtitle: 'This license is suspended and may not function properly.',
        color: 'dc3545'
      });
    } else if (eventName.includes('check-in-overdue')) {
      warnings.push({
        title: '📅 Check-in Overdue',
        subtitle: 'This license is overdue for its required check-in.',
        color: 'dc3545'
      });
    }
  }
  
  // Machine warnings
  if (eventName.includes('machine.heartbeat.dead')) {
    warnings.push({
      title: '💔 Machine Heartbeat Dead',
      subtitle: 'Machine is no longer responding to heartbeat pings.',
      color: 'dc3545'
    });
  }
  
  // Account warnings
  if (eventName.includes('subscription.canceled')) {
    warnings.push({
      title: '❌ Subscription Canceled',
      subtitle: 'Account subscription has been canceled.',
      color: 'dc3545'
    });
  }
  
  return warnings;
}

// Main function to create Teams message card
function createTeamsMessageCard(parsedData) {
  const { event, data, webhookMeta } = parsedData;
  const eventMeta = getEventMetadata(event);
  const facts = extractFacts(data, eventMeta.category);
  const dashboardUrl = generateDashboardUrl(data, eventMeta.category);
  const warnings = createWarningSection(event, data);
  
  // Create main section
  const mainSection = {
    activityTitle: `${eventMeta.icon} ${eventMeta.displayName}`,
    activitySubtitle: `${eventMeta.category.charAt(0).toUpperCase() + eventMeta.category.slice(1)} Event`,
    activityImage: `https://img.icons8.com/fluency/48/${eventMeta.category === 'license' ? 'license' : 
                                                       eventMeta.category === 'user' ? 'user' :
                                                       eventMeta.category === 'machine' ? 'computer' :
                                                       eventMeta.category === 'account' ? 'organization' : 'webhook'}.png`,
    facts: [
      ...facts,
      { name: 'Event Time', value: formatTimestamp(webhookMeta.created) }
    ],
    markdown: true
  };
  
  // Create base message card
  const messageCard = {
    "@type": "MessageCard",
    "@context": "https://schema.org/extensions",
    "summary": `${eventMeta.displayName}`,
    "themeColor": eventMeta.color,
    "sections": [mainSection]
  };
  
  // Add warning sections
  warnings.forEach(warning => {
    messageCard.sections.push({
      activityTitle: warning.title,
      activitySubtitle: warning.subtitle,
      markdown: true
    });
  });
  
  // Add action buttons
  const actions = [];
  
  if (dashboardUrl) {
    actions.push({
      "@type": "OpenUri",
      "name": `View ${eventMeta.category.charAt(0).toUpperCase() + eventMeta.category.slice(1)}`,
      "targets": [{ "os": "default", "uri": dashboardUrl }]
    });
  }
  
  // Add account dashboard link
  const accountId = data.relationships?.account?.data?.id;
  if (accountId && eventMeta.category !== 'account') {
    actions.push({
      "@type": "OpenUri",
      "name": "View Account Dashboard",
      "targets": [{ "os": "default", "uri": `https://app.keygen.sh/accounts/${accountId}` }]
    });
  }
  
  if (actions.length > 0) {
    messageCard.potentialAction = actions;
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
    const eventMeta = getEventMetadata(parsedData.event);
    
    console.log(`[${new Date().toISOString()}] Forwarding ${parsedData.event} (${eventMeta.category}) event`);

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
      category: eventMeta.category,
      objectId: parsedData.data.id,
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
    teamsConfigured: !!TEAMS_WEBHOOK_URL,
    supportedEvents: Object.values(EVENT_CATEGORIES).reduce((acc, cat) => acc + cat.events.length, 0)
  });
});

// Events endpoint - lists all supported events
app.get('/events', (req, res) => {
  const eventsList = {};
  Object.entries(EVENT_CATEGORIES).forEach(([category, config]) => {
    eventsList[category] = {
      icon: config.icon,
      color: config.baseColor,
      events: config.events
    };
  });
  
  res.json({
    categories: eventsList,
    totalEvents: Object.values(EVENT_CATEGORIES).reduce((acc, cat) => acc + cat.events.length, 0)
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Universal Webhook Forwarder',
    status: 'running',
    timestamp: new Date().toISOString(),
    supportedEvents: Object.values(EVENT_CATEGORIES).reduce((acc, cat) => acc + cat.events.length, 0),
    endpoints: {
      webhook: '/webhook (POST)',
      health: '/health (GET)',
      events: '/events (GET)'
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
  const totalEvents = Object.values(EVENT_CATEGORIES).reduce((acc, cat) => acc + cat.events.length, 0);
  console.log(`🚀 Universal Webhook Forwarder listening on port ${PORT}`);
  console.log(`📅 Started at: ${new Date().toISOString()}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✅ Teams webhook configured: ${!!TEAMS_WEBHOOK_URL}`);
  console.log(`📡 Supporting ${totalEvents} event types across ${Object.keys(EVENT_CATEGORIES).length} categories`);
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
