try {
  require('firebase-admin');
  console.log('Firebase OK');
} catch (e) {
  console.error(e);
}
