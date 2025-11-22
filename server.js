const express = require('express');
const cors = require('cors');
const dialogflow = require('@google-cloud/dialogflow');
const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const projectId = 'kakapo-chat-bot';

// Initialize NEW Gemini AI SDK
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// In-memory storage for quiz sessions
const quizSessions = {};

const credentialsPath = process.env.RENDER 
  ? '/etc/secrets/service-account-key.json'
  : './service-account-key.json';

let sessionClient;

if (fs.existsSync(credentialsPath)) {
  console.log('Using credentials from file:', credentialsPath);
  sessionClient = new dialogflow.SessionsClient({ keyFilename: credentialsPath });
} else {
  console.error('Credentials file not found at:', credentialsPath);
  process.exit(1);
}

function isQuizActive(sessionId) {
  return quizSessions[sessionId] && quizSessions[sessionId].active;
}

// Generate quiz questions using NEW Gemini SDK
async function generateQuizQuestions() {
  console.log('=== QUIZ GENERATION START ===');
  console.log('GEMINI_API_KEY exists:', !!process.env.GEMINI_API_KEY);
  
  try {
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

Generate exactly 10 questions now:`;

    console.log('Sending request to Gemini 2.5 Flash...');
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt
    });
    
    let text = response.text;
    console.log('Response received, length:', text.length);
    
    // Clean up response
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    const questions = JSON.parse(text);
    
    if (!Array.isArray(questions) || questions.length !== 10) {
      throw new Error('Invalid number of questions: ' + questions.length);
    }
    
    console.log('=== QUIZ GENERATION SUCCESS ===');
    return questions;
    
  } catch (error) {
    console.error('=== QUIZ GENERATION FAILED ===');
    console.error('Error:', error.message);
    return getFallbackQuestions();
  }
}

function getFallbackQuestions() {
  return [
    { question: "What is the Kakapo?", options: { A: "A type of owl", B: "A flightless parrot", C: "A bat species", D: "A lizard" }, correct_answer: "B", explanation: "The Kakapo is the world's only flightless parrot, native to New Zealand." },
    { question: "Where are Kakapos found in the wild?", options: { A: "Australia", B: "New Zealand", C: "Hawaii", D: "Madagascar" }, correct_answer: "B", explanation: "Kakapos are endemic to New Zealand." },
    { question: "What do Kakapos primarily eat?", options: { A: "Fish", B: "Small mammals", C: "Plants, fruits, and seeds", D: "Insects only" }, correct_answer: "C", explanation: "Kakapos are herbivores." },
    { question: "How do male Kakapos attract females?", options: { A: "Building nests", B: "Booming sounds", C: "Colorful displays", D: "Dancing" }, correct_answer: "B", explanation: "Males create bowl-shaped depressions and emit booming calls." },
    { question: "What is the conservation status of Kakapos?", options: { A: "Least Concern", B: "Endangered", C: "Critically Endangered", D: "Extinct" }, correct_answer: "C", explanation: "Kakapos are Critically Endangered." },
    { question: "When are Kakapos most active?", options: { A: "Day", B: "Dawn", C: "Night", D: "Dusk" }, correct_answer: "C", explanation: "Kakapos are nocturnal." },
    { question: "Main threat to Kakapos?", options: { A: "Climate change", B: "Introduced predators", C: "Disease", D: "Habitat loss" }, correct_answer: "B", explanation: "Introduced predators are the biggest threat." },
    { question: "How much does an adult Kakapo weigh?", options: { A: "500g", B: "1kg", C: "2-4kg", D: "10kg" }, correct_answer: "C", explanation: "Adults weigh 2-4 kg." },
    { question: "How long can Kakapos live?", options: { A: "10-20 years", B: "30-40 years", C: "60-90 years", D: "100+ years" }, correct_answer: "C", explanation: "Kakapos can live 60-90 years." },
    { question: "Why can't Kakapos fly?", options: { A: "Too heavy", B: "Evolved without predators", C: "Wings damaged", D: "Prefer walking" }, correct_answer: "B", explanation: "They evolved without natural predators." }
  ];
}

function formatQuizQuestion(questionData, questionNum, total) {
  return `🎯 **Question ${questionNum}/${total}**

${questionData.question}

**A)** ${questionData.options.A}
**B)** ${questionData.options.B}
**C)** ${questionData.options.C}
**D)** ${questionData.options.D}

Reply with A, B, C, or D! 🦜`;
}

async function handleQuizStart(sessionId) {
  try {
    console.log('Starting quiz for session:', sessionId);
    const questions = await generateQuizQuestions();
    
    quizSessions[sessionId] = {
      active: true,
      questions,
      currentQuestion: 0,
      score: 0,
      answers: []
    };
    
    const firstQuestion = formatQuizQuestion(questions[0], 1, questions.length);
    return {
      message: `🎉 **Welcome to the Kakapo Quiz!** 🦜\n\nTest your knowledge! I'll ask you 10 questions.\n\n${firstQuestion}`,
      image_url: null,
      intent: 'quiz.start'
    };
  } catch (error) {
    console.error('Error starting quiz:', error);
    return { message: 'Sorry, error starting quiz. Please try again!', image_url: null, intent: 'quiz.error' };
  }
}

function handleQuizAnswer(message, sessionId) {
  const quizData = quizSessions[sessionId];
  if (!quizData || !quizData.active) return null;
  
  const answerMatch = message.trim().toUpperCase().match(/^[ABCD]$/);
  if (!answerMatch) {
    return { message: '❌ Please answer with A, B, C, or D only!', image_url: null, intent: 'quiz.invalid' };
  }
  
  const userAnswer = answerMatch[0];
  const currentQ = quizData.questions[quizData.currentQuestion];
  const isCorrect = userAnswer === currentQ.correct_answer;
  
  if (isCorrect) quizData.score++;
  quizData.answers.push({ question: currentQ.question, userAnswer, correctAnswer: currentQ.correct_answer, isCorrect });
  
  let feedback = isCorrect
    ? `✅ **Correct!** ${currentQ.explanation}\n\n`
    : `❌ **Incorrect.** The answer was **${currentQ.correct_answer}**. ${currentQ.explanation}\n\n`;
  
  quizData.currentQuestion++;
  
  if (quizData.currentQuestion >= quizData.questions.length) {
    return handleQuizComplete(sessionId);
  }
  
  const nextQ = quizData.questions[quizData.currentQuestion];
  return {
    message: feedback + formatQuizQuestion(nextQ, quizData.currentQuestion + 1, quizData.questions.length),
    image_url: null,
    intent: 'quiz.answer'
  };
}

function handleQuizComplete(sessionId) {
  const quizData = quizSessions[sessionId];
  const score = quizData.score;
  const total = quizData.questions.length;
  const pct = Math.round((score / total) * 100);
  
  let emoji, msg;
  if (pct >= 80) { emoji = '🌟'; msg = 'Amazing! You\'re a Kakapo expert!'; }
  else if (pct >= 60) { emoji = '💚'; msg = 'Great job!'; }
  else if (pct >= 40) { emoji = '🌿'; msg = 'Good effort!'; }
  else { emoji = '🦜'; msg = 'Nice try!'; }
  
  delete quizSessions[sessionId];
  
  return {
    message: `🎉 **Quiz Complete!** 🦜\n\n${emoji} You scored **${score}/${total}** (${pct}%)\n\n${msg}`,
    image_url: null,
    intent: 'quiz.complete'
  };
}

// NEW: Handle quiz cancellation
function handleQuizCancel(sessionId) {
  if (quizSessions[sessionId]) {
    const quizData = quizSessions[sessionId];
    const answeredCount = quizData.currentQuestion;
    const score = quizData.score;
    
    delete quizSessions[sessionId];
    
    console.log(`Quiz cancelled for session: ${sessionId}. Answered: ${answeredCount}, Score: ${score}`);
  }
  
  return {
    message: 'Quiz cancelled.',
    image_url: null,
    intent: 'quiz.cancelled'
  };
}

app.post('/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    console.log(`Received: "${message}" | Session: ${sessionId}`);
    
    // NEW: Handle quiz cancellation
    if (message.toLowerCase() === 'cancel_quiz') {
      if (isQuizActive(sessionId)) {
        return res.json(handleQuizCancel(sessionId));
      }
      return res.json({ 
        message: 'No active quiz to cancel.', 
        image_url: null, 
        intent: 'quiz.no_active' 
      });
    }
    
    // Check if user wants to start quiz
    const quizKeywords = ['quiz', 'test', 'take quiz', 'start quiz', 'quiz mode'];
    const isQuizRequest = quizKeywords.some(k => message.toLowerCase().includes(k));
    
    if (isQuizRequest && !isQuizActive(sessionId)) {
      return res.json(await handleQuizStart(sessionId));
    }
    
    // Handle quiz answers
    if (isQuizActive(sessionId)) {
      const quizResponse = handleQuizAnswer(message, sessionId);
      if (quizResponse) return res.json(quizResponse);
    }
    
    // Dialogflow handling
    const sessionPath = sessionClient.projectAgentSessionPath(projectId, sessionId);
    const request = { session: sessionPath, queryInput: { text: { text: message, languageCode: 'en' } } };
    const responses = await sessionClient.detectIntent(request);
    const result = responses[0].queryResult;

    let imageUrl = null;
    if (result.fulfillmentMessages) {
      for (const msg of result.fulfillmentMessages) {
        if (msg.image?.imageUri) imageUrl = msg.image.imageUri;
        if (msg.payload?.fields?.image_url) imageUrl = msg.payload.fields.image_url.stringValue;
        if (msg.card?.imageUri) imageUrl = msg.card.imageUri;
      }
    }

    res.json({ message: result.fulfillmentText, image_url: imageUrl, intent: result.intent.displayName });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Failed', details: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`GEMINI_API_KEY configured: ${!!process.env.GEMINI_API_KEY}`);
});