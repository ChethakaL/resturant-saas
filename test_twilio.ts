import twilio from 'twilio';

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function run() {
  const messages = await client.messages.list({
    limit: 10
  });

  messages.forEach(m => {
    console.log(`SID: ${m.sid}`);
    console.log(`Direction: ${m.direction}`);
    console.log(`From: ${m.from}`);
    console.log(`To: ${m.to}`);
    console.log(`Status: ${m.status}`);
    console.log(`ErrorCode: ${m.errorCode}`);
    console.log(`DateSent: ${m.dateSent}`);
    console.log('---');
  });
}

run().catch(console.error);
