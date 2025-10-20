const express = require('express');
const cors = require('cors');
const dialogflow = require('@google-cloud/dialogflow');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const projectId = 'kakapo-chat-bot';

// Parse credentials from environment variable
let credentials;
try {
  credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
  console.log('Credentials loaded successfully');
} catch (error) {
  console.error('Failed to parse credentials:', error);
  process.exit(1);
}

const sessionClient = new dialogflow.SessionsClient({
  credentials: credentials
});

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
    res.status(500).json({ error: 'Failed to process request' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});