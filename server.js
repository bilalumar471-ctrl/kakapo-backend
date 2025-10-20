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

    res.json({
      response: result.fulfillmentText,
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