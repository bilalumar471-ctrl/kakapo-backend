const express = require('express');
const cors = require('cors');
const dialogflow = require('@google-cloud/dialogflow');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const projectId = 'kakapo-chat-bot';

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'YOUR_GEMINI_API_KEY');

// In-memory storage for quiz sessions
const quizSessions = {};

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

// Helper function to check if quiz is active
function isQuizActive(sessionId) {
  return quizSessions[sessionId] && quizSessions[sessionId].active;
}

// Generate quiz questions using Gemini
async function generateQuizQuestions() {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    
    const prompt = `Generate exactly 10 multiple choice questions about Kakapo birds (New Zealand parrots).

Rules:
1. Each question must have exactly 4 options (A, B, C, D)
2. Only ONE correct answer per question
3. Mix difficulty: 3 easy, 4 medium, 3 hard questions
4. Cover these topics: habitat, diet, behavior, conservation status, physical characteristics, breeding, threats
5. Return ONLY valid JSON, no markdown, no explanations, no code blocks

Format as a JSON array exactly like this:
[
  {
    "question": "What is the Kakapo?",
    "options": {
      "A": "A type of owl",
      "B": "A flightless parrot",
      "C": "A bat species",
      "D": "A lizard"
    },
    "correct_answer": "B",
    "explanation": "The Kakapo is the world's only flightless parrot, native to New Zealand."
  }
]

Generate exactly 10 questions now in this format:`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text();
    
    // Clean up the response - remove markdown code blocks if present
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    // Parse JSON
    const questions = JSON.parse(text);
    
    // Validate we have 10 questions
    if (!Array.isArray(questions) || questions.length !== 10) {
      throw new Error('Invalid number of questions generated');
    }
    
    return questions;
  } catch (error) {
    console.error('Error generating quiz questions:', error);
    // Return fallback questions if Gemini fails
    return getFallbackQuestions();
  }
}

// Fallback questions in case Gemini fails
function getFallbackQuestions() {
  return [
    {
      question: "What is the Kakapo?",
      options: {
        A: "A type of owl",
        B: "A flightless parrot",
        C: "A bat species",
        D: "A lizard"
      },
      correct_answer: "B",
      explanation: "The Kakapo is the world's only flightless parrot, native to New Zealand."
    },
    {
      question: "Where are Kakapos found in the wild?",
      options: {
        A: "Australia",
        B: "New Zealand",
        C: "Hawaii",
        D: "Madagascar"
      },
      correct_answer: "B",
      explanation: "Kakapos are endemic to New Zealand and found nowhere else in the wild."
    },
    {
      question: "What do Kakapos primarily eat?",
      options: {
        A: "Fish and seafood",
        B: "Small mammals",
        C: "Plants, fruits, and seeds",
        D: "Insects only"
      },
      correct_answer: "C",
      explanation: "Kakapos are herbivores that feed on native plants, fruits, seeds, and pollen."
    },
    {
      question: "How do male Kakapos attract females?",
      options: {
        A: "By building nests",
        B: "By booming sounds from bowl-shaped depressions",
        C: "By colorful displays",
        D: "By dancing"
      },
      correct_answer: "B",
      explanation: "Male Kakapos create bowl-shaped depressions and emit deep booming calls that can be heard up to 5km away."
    },
    {
      question: "What is the current conservation status of Kakapos?",
      options: {
        A: "Least Concern",
        B: "Endangered",
        C: "Critically Endangered",
        D: "Extinct in the wild"
      },
      correct_answer: "C",
      explanation: "Kakapos are Critically Endangered with fewer than 250 individuals remaining."
    },
    {
      question: "When are Kakapos most active?",
      options: {
        A: "During the day",
        B: "At dawn",
        C: "At night (nocturnal)",
        D: "At dusk only"
      },
      correct_answer: "C",
      explanation: "Kakapos are nocturnal birds, being most active during the night."
    },
    {
      question: "What is the main threat to Kakapo survival?",
      options: {
        A: "Climate change only",
        B: "Introduced predators like stoats and cats",
        C: "Disease",
        D: "Habitat loss only"
      },
      correct_answer: "B",
      explanation: "Introduced predators are the biggest threat as Kakapos evolved without natural predators."
    },
    {
      question: "Approximately how much does an adult Kakapo weigh?",
      options: {
        A: "500 grams",
        B: "1 kilogram",
        C: "2-4 kilograms",
        D: "10 kilograms"
      },
      correct_answer: "C",
      explanation: "Adult Kakapos typically weigh between 2-4 kg, making them one of the heaviest parrots."
    },
    {
      question: "How long can Kakapos live?",
      options: {
        A: "10-20 years",
        B: "30-40 years",
        C: "60-90 years",
        D: "Over 100 years"
      },
      correct_answer: "C",
      explanation: "Kakapos can live 60-90 years or more, making them one of the longest-lived bird species."
    },
    {
      question: "Why can't Kakapos fly?",
      options: {
        A: "They are too heavy",
        B: "They evolved without predators and didn't need flight",
        C: "Their wings are damaged",
        D: "They prefer walking"
      },
      correct_answer: "B",
      explanation: "Kakapos evolved in New Zealand without natural predators, so they lost the ability to fly over time."
    }
  ];
}

// Format quiz question for display
function formatQuizQuestion(questionData, questionNum, total) {
  return `🎯 **Question ${questionNum}/${total}**

${questionData.question}

**A)** ${questionData.options.A}
**B)** ${questionData.options.B}
**C)** ${questionData.options.C}
**D)** ${questionData.options.D}

Reply with A, B, C, or D! 🦜`;
}

// Start quiz
async function handleQuizStart(sessionId) {
  try {
    console.log('Starting quiz for session:', sessionId);
    
    // Generate questions using Gemini
    const questions = await generateQuizQuestions();
    
    // Store quiz session
    quizSessions[sessionId] = {
      active: true,
      questions: questions,
      currentQuestion: 0,
      score: 0,
      answers: []
    };
    
    // Return first question
    const firstQuestion = formatQuizQuestion(questions[0], 1, questions.length);
    const introText = `🎉 **Welcome to the Kakapo Quiz!** 🦜

Test your knowledge about these amazing flightless parrots! I'll ask you 10 questions.

${firstQuestion}`;
    
    return {
      message: introText,
      image_url: null,
      intent: 'quiz.start'
    };
  } catch (error) {
    console.error('Error starting quiz:', error);
    return {
      message: 'Sorry, I encountered an error starting the quiz. Please try again!',
      image_url: null,
      intent: 'quiz.error'
    };
  }
}

// Handle quiz answer
function handleQuizAnswer(message, sessionId) {
  const quizData = quizSessions[sessionId];
  
  if (!quizData || !quizData.active) {
    return null; // Not in quiz mode
  }
  
  // Extract answer (A, B, C, or D)
  const answerMatch = message.match(/^[ABCD]$/i);
  if (!answerMatch) {
    return {
      message: '❌ Please answer with A, B, C, or D only!',
      image_url: null,
      intent: 'quiz.invalid_answer'
    };
  }
  
  const userAnswer = answerMatch[0].toUpperCase();
  const currentQuestion = quizData.questions[quizData.currentQuestion];
  const correctAnswer = currentQuestion.correct_answer;
  const isCorrect = userAnswer === correctAnswer;
  
  // Update score
  if (isCorrect) {
    quizData.score++;
  }
  
  // Store answer
  quizData.answers.push({
    question: currentQuestion.question,
    userAnswer: userAnswer,
    correctAnswer: correctAnswer,
    isCorrect: isCorrect
  });
  
  // Generate feedback
  let feedback = isCorrect
    ? `✅ **Correct!** ${currentQuestion.explanation}\n\n`
    : `❌ **Incorrect.** The correct answer was **${correctAnswer}**. ${currentQuestion.explanation}\n\n`;
  
  // Move to next question
  quizData.currentQuestion++;
  
  // Check if quiz is complete
  if (quizData.currentQuestion >= quizData.questions.length) {
    return handleQuizComplete(sessionId);
  }
  
  // Get next question
  const nextQuestion = quizData.questions[quizData.currentQuestion];
  const nextQuestionText = formatQuizQuestion(
    nextQuestion,
    quizData.currentQuestion + 1,
    quizData.questions.length
  );
  
  return {
    message: feedback + nextQuestionText,
    image_url: null,
    intent: 'quiz.answer'
  };
}

// Complete quiz
function handleQuizComplete(sessionId) {
  const quizData = quizSessions[sessionId];
  const score = quizData.score;
  const total = quizData.questions.length;
  const percentage = Math.round((score / total) * 100);
  
  let emoji, message;
  if (percentage >= 80) {
    emoji = '🌟';
    message = 'Amazing! You\'re a Kakapo expert!';
  } else if (percentage >= 60) {
    emoji = '💚';
    message = 'Great job! You know your Kakapos well!';
  } else if (percentage >= 40) {
    emoji = '🌿';
    message = 'Good effort! Keep learning about Kakapos!';
  } else {
    emoji = '🦜';
    message = 'Nice try! There\'s so much to learn about Kakapos!';
  }
  
  const responseText = `🎉 **Quiz Complete!** 🦜

${emoji} You scored **${score}/${total}** (${percentage}%)

${message}

Would you like to:
- Take another quiz
- Learn more about Kakapos
- Return to main menu`;
  
  // Clear quiz session
  delete quizSessions[sessionId];
  
  return {
    message: responseText,
    image_url: null,
    intent: 'quiz.complete'
  };
}

app.post('/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    
    // Check if user wants to start quiz
    const quizKeywords = ['quiz', 'test', 'take quiz', 'start quiz', 'quiz mode'];
    const isQuizRequest = quizKeywords.some(keyword => 
      message.toLowerCase().includes(keyword)
    );
    
    if (isQuizRequest && !isQuizActive(sessionId)) {
      const quizResponse = await handleQuizStart(sessionId);
      return res.json(quizResponse);
    }
    
    // If quiz is active, handle quiz answer
    if (isQuizActive(sessionId)) {
      const quizResponse = handleQuizAnswer(message, sessionId);
      if (quizResponse) {
        return res.json(quizResponse);
      }
    }
    
    // Normal Dialogflow handling
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

    let responseText = result.fulfillmentText;
    let imageUrl = null;

    if (result.fulfillmentMessages && result.fulfillmentMessages.length > 0) {
      for (const msg of result.fulfillmentMessages) {
        if (msg.image && msg.image.imageUri) {
          imageUrl = msg.image.imageUri;
        }
        if (msg.payload && msg.payload.fields) {
          if (msg.payload.fields.image_url) {
            imageUrl = msg.payload.fields.image_url.stringValue;
          }
        }
        if (msg.card && msg.card.imageUri) {
          imageUrl = msg.card.imageUri;
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
  console.log(`Gemini API configured: ${!!process.env.GEMINI_API_KEY}`);
});
