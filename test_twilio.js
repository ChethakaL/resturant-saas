const twilio = require('twilio');
require('dotenv').config();

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function run() {
  const messages = await client.messages.list({
    to: 'whatsapp:+94712176827',
    limit: 5
  });

  messages.forEach(m => {
    console.log(`SID: ${m.sid}`);
    console.log(`Status: ${m.status}`);
    console.log(`ErrorCode: ${m.errorCode}`);
    console.log(`ErrorMessage: ${m.errorMessage}`);
    console.log(`DateSent: ${m.dateSent}`);
    console.log('---');
  });
}

run().catch(console.error);
