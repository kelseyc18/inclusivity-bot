// Require the Bolt package (github.com/slackapi/bolt)
const { App } = require("@slack/bolt");
const fetch = require("node-fetch");

const CODA_API_BASE_URL = "https://coda.io/apis/v1";

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET
});

const codaApiToken = process.env.CODA_API_TOKEN;
const codaSourceDocId = "FD9P7TjITA";
const codaInclusiveLanguage = {
  gridId: "grid-RXnKKn19Fv",
  phrasesToAvoidColumnId: "c-rnvVFxaMlT",
  alternativesColumnId: "c-ykMXbj0b7g",
  contextColumnId: "c-i8QgcB6ugx",
};

const codaUsageApiToken = process.env.CODA_USAGE_API_TOKEN;
const codaUsageSourceDocId = "R3XsLRHQYA";

const codaNudges = {
  gridId: "grid-SO4pTsgZ6D",
  wordOrPhrasesColumnId: "c-3Azl72tBy7",
  channelIdColumnId: "c-hKWfgspjib",
  dateColumnId: "c-UcIqlyh1DC"
};

const codaIntro = {
  gridId: "grid-hQUCN0H76U",
  dateColumnId: "c-fvdYkUPI53"
};

const codaAlternatives = {
  gridId: "grid-JL-zSy9NaV",
  commandTextColumnId: "c-a-n7ZtoPFZ",
  hadAlternativesColumnId: "c-D7vBSJZZ8e",
  dateColumnId: "c-ZVIg_wmLvH"
};

const INTRODUCTION_MESSAGE = `Hello! 👋

I'm new here - I'm InclusivityBot 🤖
I help foster healthy communication by privately flagging terms that may be outdated or disrespectful. I let you know why a word is harmful and offer some alternatives that can help us live our value of Right over Familiar.

Someone in this channel added me. Here's what you need to know:
• My responses are just to you. No one else can see them.
• I'm only a bot, so I don't understand context. Just keywords. I might get it wrong sometimes!
• I'm a learning tool, not a performance management tool. Your manager can't see my responses.
• No identifiable data is being tracked or shared.
For more info, check out my FAQ (coming soon).`;

const NUDGE_PREAMBLE = `Hey there! We champion right over familiar at Coda—and that includes the words we use.
`;

let nonInclusiveWords = {};

async function populateNonInclusiveWords() {
  const headers = { Authorization: "Bearer " + codaApiToken };
  const {gridId, phrasesToAvoidColumnId} = codaInclusiveLanguage;
  const url = `https://coda.io/apis/v1/docs/${codaSourceDocId}/tables/${gridId}/rows`;
  const response = await fetch(url, { headers });
  const data = await response.json();
  nonInclusiveWords = {};
  for (const row of data.items) {
    const phraseToAvoid = row.values[phrasesToAvoidColumnId].toLowerCase();
    nonInclusiveWords[phraseToAvoid] = row;
  }
}

function getDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();

  const paddedMonth = `${month}`.padStart(2, "0");
  const paddedDay = `${day}`.padStart(2, "0");

  return `${year}-${paddedMonth}-${paddedDay}`;
}

async function logNudge(nonInclusiveWordsUsed, channel) {
  const headers = {
    Authorization: "Bearer " + codaUsageApiToken,
    "Content-Type": "application/json"
  };
  const {
    gridId,
    wordOrPhrasesColumnId,
    channelIdColumnId,
    dateColumnId
  } = codaNudges;
  const url = `https://coda.io/apis/v1/docs/${codaUsageSourceDocId}/tables/${gridId}/rows`;
  const date = getDate();

  function getRowForPhrase(phrase) {
    return {
      cells: [
        {
          column: wordOrPhrasesColumnId,
          value: phrase
        },
        {
          column: channelIdColumnId,
          value: channel
        },
        {
          column: dateColumnId,
          value: date
        }
      ]
    };
  }

  const data = {
    rows: nonInclusiveWordsUsed.map(phrase => getRowForPhrase(phrase))
  };

  const response = await fetch(url, {
    headers,
    method: "post",
    body: JSON.stringify(data)
  });

  const responseData = await response.json();
}

async function logIntroCommand() {
  const headers = {
    Authorization: "Bearer " + codaUsageApiToken,
    "Content-Type": "application/json"
  };
  const { gridId, dateColumnId } = codaIntro;
  const url = `https://coda.io/apis/v1/docs/${codaUsageSourceDocId}/tables/${gridId}/rows`;
  const date = getDate();

  const data = {
    rows: [
      {
        cells: [
          {
            column: dateColumnId,
            value: date
          }
        ]
      }
    ]
  };

  const response = await fetch(url, {
    headers,
    method: "post",
    body: JSON.stringify(data)
  });

  const responseData = await response.json();

  console.log(responseData);
}

async function logAlternativeCommand(phrase, {hadAlternatives}) {
  const headers = {
    Authorization: "Bearer " + codaUsageApiToken,
    "Content-Type": "application/json"
  };
  const {
    gridId,
    commandTextColumnId,
    hadAlternativesColumnId,
    dateColumnId
  } = codaAlternatives;
  const url = `https://coda.io/apis/v1/docs/${codaUsageSourceDocId}/tables/${gridId}/rows`;
  const date = getDate();

  const data = {
    rows: [
      {
        cells: [
          {
            column: dateColumnId,
            value: date,
          },
          {
            column: commandTextColumnId,
            value: phrase,
          },
          {
            column: hadAlternativesColumnId,
            value: hadAlternatives,
          }
        ]
      }
    ]
  };

  const response = await fetch(url, {
    headers,
    method: "post",
    body: JSON.stringify(data)
  });

  const responseData = await response.json();

  console.log(responseData);
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
  let text = NUDGE_PREAMBLE;
  let suggestionText = 'Some suggestions:\n';
  for (const flaggedPhrase of flaggedWords) {
    const row = nonInclusiveWords[flaggedPhrase];
    const {alternativesColumnId, contextColumnId} = codaInclusiveLanguage;
    const context = row.values[contextColumnId];
    const alternatives = row.values[alternativesColumnId];
    text += `• ${context}\n`;
    suggestionText += `• Instead of \`${flaggedPhrase}\`, try ${alternatives}`;
  }
  return text + '\n' + suggestionText;
}

app.event("message", async ({ event, client, context }) => {
  try {
    const { channel, channel_type, text, user } = event;

    if (channel_type === "channel" || channel_type === "group") {
      const nonInclusiveWordsUsed = detectNonInclusiveLanguage(text);

      if (nonInclusiveWordsUsed.length) {
        const botResponse = getNudgeTextForNonInclusiveLanguage(
          nonInclusiveWordsUsed
        );

        const result = await client.chat.postEphemeral({
          channel,
          user,
          text: botResponse
        });
        await logNudge(nonInclusiveWordsUsed, channel);
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
      text: INTRODUCTION_MESSAGE
    });
  } catch (error) {
    console.error(error);
  }
});

app.command("/alternative", async ({ command, ack, respond }) => {
  // Acknowledge command request
  await ack();

  const commandText = command.text;
  const nonInclusiveWordsUsed = detectNonInclusiveLanguage(commandText);

  if (nonInclusiveWordsUsed.length) {
    await respond(getNudgeTextForNonInclusiveLanguage(nonInclusiveWordsUsed));
    await logAlternativeCommand(commandText, {hadAlternatives: true});
  } else {
    await respond(
      `InclusivityBot does not have any information on \`${commandText}\`.`
    );
    await logAlternativeCommand(commandText, {hadAlternatives: false});
  }
});

app.command("/intro", async ({ command, ack, say }) => {
  // Acknowledge command request
  await ack();

  await say(INTRODUCTION_MESSAGE);
  await logIntroCommand();
});

(async () => {
  // Start your app
  await app.start(process.env.PORT || 3000);

  console.log("Inclusivity bot app is running!");

  // TODO: Refresh every day
  populateNonInclusiveWords();
  console.log("Non-inclusive words populated");
})();
