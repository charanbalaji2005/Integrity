const { auth } = require('./src/providers/auth');

async function testLocalSession() {
  const token = 'zRAXpHl2cu2cuve98pRw7QNSB6SxyC5I';
  
  // Test 1: Passing the session token header
  console.log("Test 1: Passing Authorization header with token...");
  try {
    const sessionData = await auth.api.getSession({
      headers: new Headers({
        'Authorization': `Bearer ${token}`
      })
    });
    console.log("Result 1:", sessionData);
  } catch (err) {
    console.error("Error 1:", err);
  }

  // Test 2: Passing Cookie header
  console.log("\nTest 2: Passing Cookie header...");
  try {
    const sessionData = await auth.api.getSession({
      headers: new Headers({
        'Cookie': `better-auth.session_token=${token}`
      })
    });
    console.log("Result 2:", sessionData);
  } catch (err) {
    console.error("Error 2:", err);
  }

  // Test 3: Checking database sessions
  console.log("\nTest 3: Checking if token exists in DB...");
  const { prisma } = require('./src/database');
  const session = await prisma.session.findUnique({
    where: { token }
  });
  console.log("Session in DB:", session);

  process.exit(0);
}

testLocalSession();
