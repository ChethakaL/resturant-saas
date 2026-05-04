import twilio from 'twilio';

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function run() {
  try {
    // If it's a real WhatsApp sender, we can fetch the WhatsApp senders

    // The Content API might not be enabled.
    
    // Let's see if we can just send a generic Twilio approved template to test if the 24-hour window is the issue.
    // "Your {{1}} code is {{2}}"
    const testMessage = await client.messages.create({
      from: 'whatsapp:+15559478532',
      to: 'whatsapp:+94712176827',
      body: 'Your order code is 12345',
    });
    console.log(`Test message sent. SID: ${testMessage.sid}`);
    
    // Wait a couple seconds to check status
    await new Promise(r => setTimeout(r, 2000));
    
    const fetched = await client.messages(testMessage.sid).fetch();
    console.log(`Status of test message: ${fetched.status}, ErrorCode: ${fetched.errorCode}`);
  } catch (error) {
    console.error(error);
  }
}

run();
