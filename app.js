// Require the Bolt package (github.com/slackapi/bolt)
const { App } = require("@slack/bolt");
const fetch = require('node-fetch');

const CODA_API_BASE_URL = "https://coda.io/apis/v1";

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET
});

const codaApiToken = process.env.CODA_API_TOKEN;
const codaSourceDocId = "FD9P7TjITA";
const codaTableId = "grid-RXnKKn19Fv";
const phrasesToAvoidColumnId = "c-rnvVFxaMlT";

const INTRODUCTION_MESSAGE = `Hello! 👋

I'm new here - I'm InclusivityBot 🤖
I help foster healthy communication by privately flagging terms that may be outdated or disrespectful. I let you know why a word is harmful and offer some alternatives that can help us live our value of Right over Familiar.

Someone in this channel added me. Here's what you need to know:
* My responses are just to you. No one else can see them.
* I'm only a bot, so I don't understand context. Just keywords. I might get it wrong sometimes!
* I'm a learning tool, not a performance management tool. Your manager can't see my responses.
* No identifiable data is being tracked or shared.
For more info, check out my FAQ (coming soon).`;

const NUDGE_PREAMBLE = `Hey there! We champion right over familiar at Coda—and that includes the words we use.
`;

let nonInclusiveWords = {};

async function populateNonInclusiveWords() {
  const headers = { Authorization: "Bearer " + codaApiToken };
  const url =
    `https://coda.io/apis/v1/docs/${codaSourceDocId}/tables/${codaTableId}/rows`;
  const response = await fetch(url, { headers });
  const data = await response.json();
  nonInclusiveWords = {};
  for (const row of data.items) {
    const phraseToAvoid = row.values[phrasesToAvoidColumnId].toLowerCase();
    nonInclusiveWords[phraseToAvoid] = row;
  }
}

function detectNonInclusiveLanguage(message) {
  const lowercaseMessage = message.toLowerCase();
  const words = lowercaseMessage.split(/\s+/);
  return Object.keys(nonInclusiveWords).filter(w => {
    const regex = new RegExp(`\\b${w}\\b`);
    return lowercaseMessage.match(regex);
  });
}

function getNudgeTextForNonInclusiveLanguage(flaggedWords) {
  return `${NUDGE_PREAMBLE}\`${flaggedWords.join(", ")}\``;
}

app.event("message", async ({ event, client, context }) => {
  try {
    const { channel, channel_type, text, user } = event;

    if (channel_type === "channel") {
      const nonInclusiveWordsUsed = detectNonInclusiveLanguage(text);

      if (nonInclusiveWordsUsed.length) {
        const botResponse = getNudgeTextForNonInclusiveLanguage(nonInclusiveWordsUsed);

        const result = await client.chat.postEphemeral({
          channel,
          user,
          text: botResponse
        });

        console.log(result);
      }
    }
  } catch (error) {
    console.error(error);
  }
});

app.event("member_joined_channel", async ({ event, client, context }) => {
  try {
    const { channel, user } = event;
        
    const result = await client.chat.postEphemeral({
      channel,
      user,
      text: INTRODUCTION_MESSAGE,
    });
    
    console.error(result);
  } catch (error) {
    console.error(error);
  }
});

app.command('/alternative', async ({ command, ack, respond }) => {
  // Acknowledge command request
  await ack();

  const nonInclusiveWordsUsed = detectNonInclusiveLanguage(command.text);

  if (nonInclusiveWordsUsed.length) {
    await respond(getNudgeTextForNonInclusiveLanguage(nonInclusiveWordsUsed));
  } else {
    await respond(`InclusivityBot does not have any information on \`${command.text}\`.`);
  }
});

(async () => {
  // Start your app
  await app.start(process.env.PORT || 3000);

  console.log("Inclusivity bot app is running!");
  populateNonInclusiveWords();
  console.log("Non-inclusive words populated");
})();
