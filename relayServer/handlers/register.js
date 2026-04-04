import 'dotenv/config';

export const handleRegister = async (socket, response, clients) => {

  if (!response.token) {
    socket.write(JSON.stringify({
      type: 'error',
      message: `No token provided. Visit ${process.env.FRONTEND_URL}/register`
    }) + '\n');
    socket.end();
    return;
  }

  try {
    const apiResponse = await fetch(`${process.env.API_URL}/internal/tunnel/connected`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_SECRET
      },
      body: JSON.stringify({
        token: response.token,
        subdomain: response.subdomain
      })
    });

    const data = await apiResponse.json();

    if (!apiResponse.ok) {
      socket.write(JSON.stringify({
        type: 'error',
        message: data.message
      }) + '\n');
      socket.end();
      return;
    }

    const subdomain = data.subdomain;

    if (clients[subdomain]) {
      socket.write(JSON.stringify({
        type: 'error',
        message: `Subdomain ${subdomain} is already taken`
      }) + '\n');
      socket.end();
      return;
    }

    clients[subdomain] = socket;

    socket.write(JSON.stringify({
      type: 'registered',
      subdomain: subdomain,
      email: data.email,
      isPremium: data.isPremium
    }) + '\n');

    console.log(`Tunnel registered: ${subdomain} (${data.email})`);

  } catch (err) {
    console.log('API call failed:', err.message);
    socket.write(JSON.stringify({
      type: 'error',
      message: 'Authentication service unavailable'
    }) + '\n');
    socket.end();
  }
};