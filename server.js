const express = require('express');
const cors = require('cors');
const dialogflow = require('@google-cloud/dialogflow');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const projectId = 'kakapo-chat-bot';

// Check if running on Render (secret file) or locally
const credentialsPath = process.env.RENDER 
  ? '/etc/secrets/service-account-key.json'
  : './service-account-key.json';

let sessionClient;

if (fs.existsSync(credentialsPath)) {
  console.log('Using credentials from file:', credentialsPath);
  sessionClient = new dialogflow.SessionsClient({
    keyFilename: credentialsPath
  });
} else {
  console.error('Credentials file not found at:', credentialsPath);
  process.exit(1);
}

app.post('/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    
    const sessionPath = sessionClient.projectAgentSessionPath(
      projectId,
      sessionId
    );

    const request = {
      session: sessionPath,
      queryInput: {
        text: {
          text: message,
          languageCode: 'en',
        },
      },
    };

    const responses = await sessionClient.detectIntent(request);
    const result = responses[0].queryResult;

    // Extract text response
    let responseText = result.fulfillmentText;
    let imageUrl = null;

    // Check for images in fulfillment messages
    if (result.fulfillmentMessages && result.fulfillmentMessages.length > 0) {
      for (const message of result.fulfillmentMessages) {
        // Check for image message type
        if (message.image && message.image.imageUri) {
          imageUrl = message.image.imageUri;
        }
        // Check for custom payload with image_url
        if (message.payload && message.payload.fields) {
          if (message.payload.fields.image_url) {
            imageUrl = message.payload.fields.image_url.stringValue;
          }
        }
        // Also check for card with image
        if (message.card && message.card.imageUri) {
          imageUrl = message.card.imageUri;
        }
      }
    }

    res.json({
      message: responseText,
      image_url: imageUrl,
      intent: result.intent.displayName
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed to process request', details: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});