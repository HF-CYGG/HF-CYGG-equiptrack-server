fetch('http://localhost:3000/api/login', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({contact: 'furry', password: '1330'})
})
.then(res => res.json())
.then(data => {
    console.log('Login token received');
    return fetch('http://localhost:3000/api/approvals', {
        headers: {'Authorization': 'Bearer ' + data.token}
    });
})
.then(res => {
    console.log('Approvals status:', res.status);
    return res.text();
})
.then(text => console.log('Approvals body:', text))
.catch(err => console.error('Error:', err));
