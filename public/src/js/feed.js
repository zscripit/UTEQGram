var shareImageButton = document.getElementById("share-image-button");
var createPostArea = document.getElementById("create-post");
var sharedMomentsArea = document.getElementById("shared-moments");
var closeCreatePostModalButton = document.getElementById(
    "close-create-post-modal-btn",
);
var form = document.querySelector("#create-post form");
var titleInput = document.getElementById("title");
var locationInput = document.getElementById("location");

function openCreatePostModal() {
    createPostArea.style.display = "block";
    setTimeout(function () {
        createPostArea.style.transform = "translateY(0)";
    }, 1);
}

function closeCreatePostModal() {
    createPostArea.style.transform = "translateY(100vh)";
    setTimeout(function () {
        createPostArea.style.display = "none";
    }, 300);
}

shareImageButton.addEventListener("click", openCreatePostModal);

closeCreatePostModalButton.addEventListener("click", closeCreatePostModal);

function createCard(data) {
    var cardWrapper = document.createElement("div");
    cardWrapper.className = "shared-moment-card mdl-card mdl-shadow--2dp";
    var cardTitle = document.createElement("div");
    cardTitle.className = "mdl-card__title";
    cardTitle.style.backgroundImage = 'url("' + data.image + '")';
    cardTitle.style.backgroundSize = "cover";
    cardTitle.style.height = "180px";
    cardWrapper.appendChild(cardTitle);
    var cardTitleTextElement = document.createElement("h2");
    cardTitleTextElement.style.color = "white";
    cardTitleTextElement.className = "mdl-card__title-text";
    cardTitleTextElement.textContent = data.title;
    cardTitle.appendChild(cardTitleTextElement);
    var cardSupportingText = document.createElement("div");
    cardSupportingText.className = "mdl-card__supporting-text";
    cardSupportingText.textContent = data.location;
    cardSupportingText.style.textAlign = "center";
    cardWrapper.appendChild(cardSupportingText);
    if (window.componentHandler) {
        componentHandler.upgradeElement(cardWrapper);
    }
    sharedMomentsArea.appendChild(cardWrapper);
}

function clearCards(){
    while (sharedMomentsArea.hasChildNodes()){
        sharedMomentsArea.removeChild(sharedMomentsArea.firstChild);
    }
}

function updateUI(data) {
    clearCards();
    for (var i = 0; i < data.length; i++) {
        createCard(data[i]);
    }
}

var url = POSTS_URL + "?select=*&apikey=" + API_KEY;
var networkDataReceived = false;

var feedRequestId = 0;

// Justo al recuperar la conexión la red (o el SW) puede seguir fallando unos
// instantes, así que se reintenta. Solo se pinta la respuesta más reciente para
// que una petición vieja que llegue tarde no tape los posts nuevos.
function loadFeed(retries) {
    if (retries === undefined) retries = 3;
    var requestId = ++feedRequestId;
    return fetch(url, {cache: "no-store"})
        .then(function (res) {
            if (!res.ok) {
                throw new Error("HTTP " + res.status);
            }
            return res.json();
        })
        .then(function (data) {
            if (requestId !== feedRequestId) return;
            networkDataReceived = true;
            console.log("From web", data);
            updateUI(data);
        })
        .catch(function (err) {
            console.log("No se pudo cargar el feed desde la red", err);
            if (retries > 0 && requestId === feedRequestId) {
                setTimeout(function () {
                    loadFeed(retries - 1);
                }, 1500);
            }
        });
}

loadFeed();

if ("indexedDB" in window) {
    readAllData('posts')
        .then(function (data) {
            if (!networkDataReceived) {
                console.log("From cache", data);
                updateUI(data);
            }
        });
}

function showToast(message) {
    var toast = document.getElementById("confirmation-toast");
    if (toast && toast.MaterialSnackbar) {
        toast.MaterialSnackbar.showSnackbar({message: message});
    }
}

function queuePost(post) {
    return writeData(SYNC_STORE, post)
        .then(function () {
            console.log("[Post encolado]", post);
            showToast("Sin conexión: tu post se publicará al recuperar la conexión");
            scheduleRetry();
            if (!("serviceWorker" in navigator && "SyncManager" in window)) {
                return;
            }
            return navigator.serviceWorker.ready
                .then(function (sw) {
                    return sw.sync.register(SYNC_TAG);
                })
                .then(function () {
                    console.log("[Sync] Background Sync registrado: " + SYNC_TAG);
                })
                .catch(function (err) {
                    // Pasa si el permiso de sincronización en segundo plano está bloqueado;
                    // la cola se enviará con los eventos de la página
                    console.log("Background Sync no disponible", err);
                });
        });
}

form.addEventListener("submit", function (event) {
    event.preventDefault();

    var title = titleInput.value.trim();
    var location = locationInput.value.trim();
    if (!title || !location) {
        alert("Por favor ingresa un título y una ubicación");
        return;
    }

    var post = {
        id: new Date().toISOString(),
        title: title,
        location: location,
        image: POST_IMAGE
    };

    closeCreatePostModal();
    form.reset();

    if (!navigator.onLine) {
        queuePost(post);
        return;
    }

    sendPost(post)
        .then(function () {
            console.log("[Post enviado]", post);
            showToast("Post publicado");
            loadFeed();
        })
        .catch(function (err) {
            // Si la red falla a medio camino, también se encola
            console.log("Falló el envío, se encola el post", err);
            queuePost(post);
        });
});

// El service worker avisa cuando terminó de enviar los posts encolados
if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", function (event) {
        if (event.data && event.data.type === "posts-synced") {
            console.log("[Sync] Posts encolados enviados, actualizando feed");
            showToast("Tus posts pendientes se publicaron");
            loadFeed();
        }
    });
}

// El envío de la cola se dispara por:
//  - evento sync del SW (el navegador detecta la reconexión)
//  - online, al cargar la página y al volver a la pestaña
//  - reintento cada 5 s solo mientras queden posts sin enviar. Hace falta porque si
//    se cae el internet pero no la red local, el navegador sigue "en línea" y al
//    volver no dispara ningún evento.
var flushing = false;
var retryTimer = null;
var RETRY_DELAY = 5000;

function scheduleRetry() {
    if (retryTimer) return;
    retryTimer = setTimeout(function () {
        retryTimer = null;
        flushQueue();
    }, RETRY_DELAY);
}

function stopRetry() {
    clearTimeout(retryTimer);
    retryTimer = null;
}

function flushQueue() {
    if (flushing) return;
    if (!navigator.onLine) {
        // Sin red no se gasta el intento; el evento online lo reanuda
        return;
    }
    flushing = true;
    syncPendingPosts()
        .then(function (result) {
            flushing = false;
            if (result.sent > 0) {
                showToast("Tus posts pendientes se publicaron");
                loadFeed();
            }
            if (result.pending > 0) {
                scheduleRetry();
            } else {
                stopRetry();
            }
        });
}

window.addEventListener("online", flushQueue);
window.addEventListener("focus", flushQueue);
document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") {
        flushQueue();
    }
});
flushQueue();
