var POSTS_URL = 'https://nrfedpkihyhpqnuvgtnx.supabase.co/rest/v1/post';
var API_KEY = 'sb_publishable_I5824B5GMPWWNIQ5CCyZQA_qs7ruhpJ';
// Todos los posts usan la misma imagen
var POST_IMAGE = 'https://nrfedpkihyhpqnuvgtnx.supabase.co/storage/v1/object/public/Default/img.jpg';
var SYNC_STORE = 'sync-posts';
var SYNC_TAG = 'sync-new-posts';

var dbPromise = idb.open('posts-store', 2, function (db) {
    if (!db.objectStoreNames.contains('posts')) {
        db.createObjectStore("posts", {keyPath: 'id'})
    }
    // Cola de posts pendientes de enviar cuando no hay conexión
    if (!db.objectStoreNames.contains(SYNC_STORE)) {
        db.createObjectStore(SYNC_STORE, {keyPath: 'id'})
    }
})

function writeData(st, data) {
    return dbPromise
        .then(function (db){
            var tx = db.transaction(st, 'readwrite');
            var store = tx.objectStore(st);
            store.put(data);
            return tx.complete;
        });
}

function readAllData(st){
    return dbPromise
    .then(function (db){
        var tx = db.transaction(st, 'readonly');
        var store = tx.objectStore(st);
        return store.getAll();
    });
}

function clearAllData(st){
    return dbPromise
    .then(function (db){
        var tx = db.transaction(st, 'readwrite');
        var store = tx.objectStore(st);
        store.clear();
        return tx.complete;
    });
}

function deleteItemFromData(st, id){
    return dbPromise
        .then(function (db){
            var tx = db.transaction(st, 'readwrite');
            var store = tx.objectStore(st);
            store.delete(id);
            return tx.complete;
        })
        .then(function (){
            console.log('Item deleted!');
        });
}

function sendPost(post) {
    return fetch(POSTS_URL, {
        method: 'POST',
        headers: {
            'apikey': API_KEY,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
        },
        body: JSON.stringify(post)
    }).then(function (res) {
        // 409 = ya existe un post con ese id (lo envió otro intento), se toma como enviado
        if (!res.ok && res.status !== 409) {
            throw new Error('Error al crear el post: ' + res.status);
        }
        return res;
    });
}

// Envía los posts encolados y saca de la cola los que se enviaron.
// Devuelve {sent, pending}. Los fallos no se registran en consola porque se reintentan.
function syncPendingPosts() {
    return readAllData(SYNC_STORE)
        .then(function (posts) {
            return Promise.all(posts.map(function (post) {
                return sendPost(post)
                    .then(function () {
                        console.log('[Sync] Post enviado', post);
                        return deleteItemFromData(SYNC_STORE, post.id);
                    })
                    .then(function () {
                        return true;
                    })
                    .catch(function () {
                        return false;
                    });
            }));
        })
        .then(function (results) {
            var sent = results.filter(Boolean).length;
            return {sent: sent, pending: results.length - sent};
        });
}
