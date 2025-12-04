const http = require('http');

// 1. Login to get token
const loginData = JSON.stringify({
  contact: "furry",
  password: "1330"
});

const loginOptions = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': loginData.length
  }
};

const req = http.request(loginOptions, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    if (res.statusCode === 200) {
      const { token } = JSON.parse(data);
      console.log("Login successful, token:", token.substring(0, 20) + "...");
      fetchApprovals(token);
    } else {
      console.error("Login failed:", res.statusCode, data);
    }
  });
});

req.write(loginData);
req.end();

function fetchApprovals(token) {
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/approvals',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  };

  const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      console.log("Approvals response status:", res.statusCode);
      console.log("Approvals response body:", data);
    });
  });
  
  req.end();
}
