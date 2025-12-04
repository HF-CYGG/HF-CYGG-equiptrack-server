console.log('Start');
try {
    fetch('http://127.0.0.1:3000').then(res => console.log(res.status)).catch(err => console.error(err));
} catch (e) {
    console.error(e);
}
console.log('End synchronous part');
