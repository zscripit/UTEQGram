if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
        .then(function (registration) {
            console.log('Service worker has been registered!', registration.scope);
        })
        .catch(function (error) {
            console.error('Service worker registration failed:', error);
        });
}
