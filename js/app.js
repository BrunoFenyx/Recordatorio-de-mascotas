(function () {
  "use strict";

  const SIZE_MAIN = "s1200";
  const SIZE_MODAL = "w1600";
  const SIZE_CARD = "w900";

  const htmlEscapes = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  };

  let mediaModal = null;
  let ytApiPromise = null;
  const songPlayers = new Map();
  let activeSongId = null;
  let songPlayerCounter = 0;

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return htmlEscapes[char];
    });
  }

  function imageBase(preview) {
    if (!preview) return null;
    return String(preview).split("=")[0];
  }

  function imageUrl(record, size) {
    const base = imageBase(record.preview);
    return base ? base + "=" + size : null;
  }

  function typeIcon(tipo) {
    return tipo === "video" ? "bi-camera-video-fill" : "bi-image-fill";
  }

  function typeLabel(tipo) {
    return tipo === "video" ? "Video" : "Foto";
  }

  function youtubeId(url) {
    const match = String(url || "").match(
      /(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{6,})/
    );
    return match ? match[1] : null;
  }

  function driveId(url) {
    const match = String(url || "").match(/\/file\/d\/([^/?#]+)/);
    return match ? match[1] : null;
  }

  async function loadData() {
    try {
      const response = await fetch("mascotas.json", { cache: "no-store" });
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.info("Usando los datos locales de js/data.js.");
    }

    if (window.MASCOTAS_DATA) {
      return window.MASCOTAS_DATA;
    }

    throw new Error("No se pudieron cargar los datos.");
  }

  function placeholderSlide(nombre) {
    return (
      '<div class="slide-placeholder" role="img" aria-label="Sin foto disponible">' +
      '<i class="bi bi-camera" aria-hidden="true"></i>' +
      "</div>"
    );
  }

  function placeholderCard() {
    return (
      '<span class="card-placeholder" aria-hidden="true">' +
      '<i class="bi bi-image"></i>' +
      "</span>"
    );
  }

  function fallbackPanel(title, text, href, linkLabel) {
    const link = href
      ? '<a href="' + escapeHtml(href) + '" target="_blank" rel="noopener">' +
        '<i class="bi bi-box-arrow-up-right" aria-hidden="true"></i>' +
        escapeHtml(linkLabel || "Abrir original") +
        "</a>"
      : "";

    return (
      '<div class="media-fallback">' +
      '<div class="fallback-icon"><i class="bi bi-heart-fill" aria-hidden="true"></i></div>' +
      "<h3>" + escapeHtml(title) + "</h3>" +
      "<p>" + escapeHtml(text) + "</p>" +
      link +
      "</div>"
    );
  }

  function guardBrokenImages(root) {
    root.querySelectorAll("img[data-placeholder]").forEach(function (img) {
      img.addEventListener(
        "error",
        function () {
          const placeholder = document.createElement("div");
          placeholder.className = img.dataset.placeholder;
          placeholder.innerHTML = '<i class="bi bi-image" aria-hidden="true"></i>';
          img.replaceWith(placeholder);
        },
        { once: true }
      );
    });
  }

  function renderSlides(recursos) {
    if (!recursos.length) {
      return placeholderSlide();
    }

    return recursos
      .map(function (record, index) {
        const src = imageUrl(record, SIZE_MAIN);
        const content = src
          ? '<img src="' + escapeHtml(src) + '" alt="' + escapeHtml(record.nombre) +
            '" data-placeholder="slide-placeholder"' +
            (index === 0 ? ' fetchpriority="high"' : ' loading="lazy"') + ">"
          : placeholderSlide(record.nombre);

        return (
          '<div class="foto-slide' + (index === 0 ? " active" : "") +
          '" data-slide="' + index + '">' + content + "</div>"
        );
      })
      .join("");
  }

  function renderDots(recursos) {
    return recursos
      .map(function (record, index) {
        return (
          '<button type="button" data-dot="' + index + '"' +
          (index === 0 ? ' class="active" aria-current="true"' : "") +
          ' aria-label="Ir al recuerdo ' + (index + 1) + '"></button>'
        );
      })
      .join("");
  }

  function renderCards(recursos) {
    const rest = recursos.slice(1);
    if (!rest.length) {
      return (
        '<div class="recuerdos-empty">' +
        '<i class="bi bi-camera" aria-hidden="true"></i> ' +
        "Por ahora este es el único recuerdo guardado." +
        "</div>"
      );
    }

    return (
      '<div class="recuerdos-grid">' +
      rest
        .map(function (record) {
          const index = recursos.indexOf(record);
          const src = imageUrl(record, SIZE_CARD);
          const media = src
            ? '<img src="' + escapeHtml(src) + '" alt="" loading="lazy" data-placeholder="card-placeholder">'
            : placeholderCard();
          const play =
            record.tipo === "video"
              ? '<span class="card-play" aria-hidden="true"><i class="bi bi-play-fill"></i></span>'
              : "";

          return (
            '<button type="button" class="recuerdo-card" data-recuerdo="' + index + '" ' +
            'aria-label="Ver ' + escapeHtml(typeLabel(record.tipo).toLowerCase()) + ": " +
            escapeHtml(record.nombre) + '">' +
            media +
            '<span class="card-overlay" aria-hidden="true"></span>' +
            '<span class="card-kind"><i class="bi ' + typeIcon(record.tipo) + '" aria-hidden="true"></i>' +
            typeLabel(record.tipo) + "</span>" +
            play +
            '<span class="card-name">' + escapeHtml(record.nombre) +
            ' <i class="bi bi-arrows-angle-expand" aria-hidden="true"></i></span>' +
            "</button>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function songChip(mascota) {
    if (!mascota.cancion) return "";

    const titulo = mascota.cancion.titulo || "Canción";
    const artista = mascota.cancion.artista || "";

    return (
      '<button type="button" class="meta-chip song-chip" data-song="' + escapeHtml(mascota.id) + '" ' +
      'aria-label="Reproducir ' + escapeHtml(titulo) + ' de fondo" aria-pressed="false">' +
      '<i class="bi bi-music-note-beamed song-note" aria-hidden="true"></i>' +
      '<span class="song-equalizer" aria-hidden="true"><span></span><span></span><span></span><span></span></span>' +
      '<span class="song-text">' +
      '<span class="song-title">' + escapeHtml(titulo) + "</span>" +
      (artista ? '<span class="song-artist">' + escapeHtml(artista) + "</span>" : "") +
      "</span>" +
      '<i class="bi bi-play-circle-fill song-toggle-icon" aria-hidden="true"></i>' +
      "</button>"
    );
  }

  function renderMascota(mascota, recursos) {
    const section = document.createElement("article");
    section.className = "mascota-card reveal";
    section.dataset.mascota = mascota.id;

    const otros = Math.max(recursos.length - 1, 0);
    const especie = mascota.especie
      ? '<span class="especie-badge"><i class="bi bi-bookmark-heart-fill" aria-hidden="true"></i>' +
        escapeHtml(mascota.especie) + "</span>"
      : "";
    const anios = mascota.anios
      ? '<span class="meta-chip"><i class="bi bi-calendar-heart" aria-hidden="true"></i>' +
        escapeHtml(mascota.anios) + "</span>"
      : "";

    section.innerHTML =
      '<div class="row align-items-center g-4 g-lg-5">' +
        '<div class="col-lg-6">' +
          '<div class="foto-stage">' +
            '<div class="foto-ring" aria-hidden="true"></div>' +
            '<div class="foto-frame" role="button" tabindex="0" ' +
              'aria-label="Ver el recuerdo que se muestra en la foto">' +
              renderSlides(recursos) +
            "</div>" +
            (recursos.length
              ? '<span class="foto-counter">1 / ' + recursos.length + "</span>"
              : "") +
          "</div>" +
          (recursos.length > 1
            ? '<div class="carousel-controls">' +
                '<button type="button" class="carousel-btn" data-prev aria-label="Recuerdo anterior">' +
                '<i class="bi bi-arrow-left" aria-hidden="true"></i></button>' +
                '<div class="carousel-dots" role="tablist" aria-label="Recuerdos">' +
                renderDots(recursos) + "</div>" +
                '<button type="button" class="carousel-btn" data-next aria-label="Recuerdo siguiente">' +
                '<i class="bi bi-arrow-right" aria-hidden="true"></i></button>' +
              "</div>"
            : "") +
          '<p class="foto-caption" aria-live="polite">' +
            (recursos.length
              ? '<i class="bi ' + typeIcon(recursos[0].tipo) + '" aria-hidden="true"></i>' +
                escapeHtml(recursos[0].nombre)
              : "Todavía no hay recuerdos para mostrar.") +
          "</p>" +
        "</div>" +
        '<div class="col-lg-6">' +
          '<div class="info-panel">' +
            '<div class="pet-head">' +
              '<h2 class="pet-name">' + escapeHtml(mascota.nombre) + "</h2>" +
              especie +
            "</div>" +
            '<div class="meta-row">' + anios + songChip(mascota) + "</div>" +
            '<p class="song-status" data-song-status role="status"></p>' +
            '<div class="historia">' +
              '<span class="historia-label">' +
              '<i class="bi bi-feather" aria-hidden="true"></i> Historia</span>' +
              "<p>" + escapeHtml(mascota.historia || "Su historia todavía está por escribirse.") + "</p>" +
            "</div>" +
          "</div>" +
        "</div>" +
      "</div>" +
      '<div class="recuerdos">' +
        '<div class="recuerdos-head">' +
          '<h3 class="recuerdos-title">Más recuerdos</h3>' +
          (otros
            ? '<span class="recuerdos-count">' + otros + (otros === 1 ? " recuerdo" : " recuerdos") + "</span>"
            : "") +
        "</div>" +
        renderCards(recursos) +
      "</div>";

    guardBrokenImages(section);
    initCarousel(section, mascota, recursos);
    initSongChip(section, mascota);
    return section;
  }

  function initCarousel(section, mascota, recursos) {
    const slides = Array.from(section.querySelectorAll("[data-slide]"));
    const dots = Array.from(section.querySelectorAll("[data-dot]"));
    const counter = section.querySelector(".foto-counter");
    const caption = section.querySelector(".foto-caption");
    const frame = section.querySelector(".foto-frame");
    const prev = section.querySelector("[data-prev]");
    const next = section.querySelector("[data-next]");

    if (!recursos.length) return;

    let current = 0;

    function show(index) {
      current = (index + recursos.length) % recursos.length;

      slides.forEach(function (slide, slideIndex) {
        slide.classList.toggle("active", slideIndex === current);
      });

      dots.forEach(function (dot, dotIndex) {
        const active = dotIndex === current;
        dot.classList.toggle("active", active);
        if (active) {
          dot.setAttribute("aria-current", "true");
        } else {
          dot.removeAttribute("aria-current");
        }
      });

      if (counter) {
        counter.textContent = current + 1 + " / " + recursos.length;
      }

      if (caption) {
        const record = recursos[current];
        caption.innerHTML =
          '<i class="bi ' + typeIcon(record.tipo) + '" aria-hidden="true"></i>' +
          escapeHtml(record.nombre);
      }

      if (frame) {
        frame.setAttribute("aria-label", "Ver " + typeLabel(recursos[current].tipo).toLowerCase() +
          ": " + recursos[current].nombre);
      }
    }

    if (prev) prev.addEventListener("click", function () { show(current - 1); });
    if (next) next.addEventListener("click", function () { show(current + 1); });

    dots.forEach(function (dot, index) {
      dot.addEventListener("click", function () { show(index); });
    });

    if (frame) {
      frame.addEventListener("click", function () {
        openRecuerdo(recursos[current]);
      });
      frame.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openRecuerdo(recursos[current]);
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          show(current - 1);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          show(current + 1);
        }
      });
    }

    section.querySelectorAll("[data-recuerdo]").forEach(function (card) {
      card.addEventListener("click", function () {
        const index = Number(card.dataset.recuerdo);
        if (Number.isInteger(index) && recursos[index]) {
          openRecuerdo(recursos[index]);
        }
      });
    });

    show(0);
  }

  function loadYouTubeApi() {
    if (window.YT && window.YT.Player) {
      return Promise.resolve(window.YT);
    }

    if (ytApiPromise) {
      return ytApiPromise;
    }

    ytApiPromise = new Promise(function (resolve, reject) {
      const previousCallback = window.onYouTubeIframeAPIReady;

      window.onYouTubeIframeAPIReady = function () {
        if (typeof previousCallback === "function") {
          previousCallback();
        }
        resolve(window.YT);
      };

      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = function () {
        ytApiPromise = null;
        reject(new Error("No se pudo cargar el reproductor de YouTube."));
      };
      document.head.appendChild(script);

      window.setTimeout(function () {
        if (window.YT && window.YT.Player) {
          resolve(window.YT);
        } else {
          ytApiPromise = null;
          reject(new Error("YouTube tardó demasiado en responder."));
        }
      }, 12000);
    });

    return ytApiPromise;
  }

  function mascotaSection(mascotaId) {
    return Array.from(document.querySelectorAll(".mascota-card")).find(function (section) {
      return section.dataset.mascota === mascotaId;
    }) || null;
  }

  function setSongStatus(mascota, message) {
    const section = mascotaSection(mascota.id);
    if (!section) return;

    const status = section.querySelector("[data-song-status]");
    if (!status) return;

    if (message) {
      status.innerHTML = '<i class="bi bi-exclamation-circle" aria-hidden="true"></i>' +
        escapeHtml(message);
      status.classList.add("is-visible");
    } else {
      status.textContent = "";
      status.classList.remove("is-visible");
    }
  }

  function setSongUi(mascota, state, message) {
    const section = mascotaSection(mascota.id);
    if (!section) return;

    const chip = section.querySelector("[data-song]");
    const titulo = (mascota.cancion && mascota.cancion.titulo) || "la canción";

    if (chip) {
      const playing = state === "playing";
      const loading = state === "loading";

      chip.classList.toggle("is-playing", playing);
      chip.classList.toggle("is-loading", loading);
      chip.setAttribute("aria-pressed", playing ? "true" : "false");
      chip.setAttribute("aria-busy", loading ? "true" : "false");
      chip.setAttribute("aria-label", (playing ? "Pausar " : "Reproducir ") + titulo + " de fondo");

      const icon = chip.querySelector(".song-toggle-icon");
      if (icon) {
        icon.className = "bi song-toggle-icon " +
          (playing ? "bi-pause-circle-fill" : "bi-play-circle-fill");
      }
    }

    setSongStatus(mascota, message);
  }

  function resetSongPlayer(mascotaId) {
    const entry = songPlayers.get(mascotaId);
    if (!entry) return;

    try {
      if (entry.player && typeof entry.player.destroy === "function") {
        entry.player.destroy();
      }
    } catch (error) {
      console.info("No se pudo destruir el reproductor anterior.");
    }

    if (entry.container && entry.container.parentNode) {
      entry.container.parentNode.removeChild(entry.container);
    }

    songPlayers.delete(mascotaId);
    if (activeSongId === mascotaId) activeSongId = null;
  }

  function createSongPlayer(mascota, videoId) {
    const host = document.getElementById("audioPlayers");
    if (!host) {
      throw new Error("No se encontró el contenedor de audio.");
    }

    const container = document.createElement("div");
    container.id = "yt-song-" + (++songPlayerCounter);
    host.appendChild(container);

    const entry = {
      player: null,
      ready: false,
      loading: true,
      container: container,
      readyPromise: null
    };

    entry.readyPromise = loadYouTubeApi().then(function (YT) {
      return new Promise(function (resolve, reject) {
        const playerVars = {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          loop: 1,
          playlist: videoId,
          playsinline: 1,
          rel: 0
        };

        if (window.location.origin && window.location.origin !== "null") {
          playerVars.origin = window.location.origin;
        }

        entry.player = new YT.Player(container.id, {
          videoId: videoId,
          width: 1,
          height: 1,
          playerVars: playerVars,
          events: {
            onReady: function (event) {
              entry.ready = true;
              entry.loading = false;
              event.target.setVolume(60);
              resolve(event.target);
            },
            onStateChange: function (event) {
              handleSongState(mascota, event.data);
            },
            onError: function (event) {
              entry.ready = false;
              entry.loading = false;
              handleSongError(mascota, event.data);
              reject(new Error("YouTube error " + event.data));
            }
          }
        });
      });
    });

    entry.readyPromise.catch(function () {});
    songPlayers.set(mascota.id, entry);
    return entry;
  }

  function handleSongState(mascota, state) {
    if (!window.YT || !window.YT.PlayerState) return;

    if (state === window.YT.PlayerState.PLAYING) {
      activeSongId = mascota.id;
      setSongUi(mascota, "playing", "");
    } else if (state === window.YT.PlayerState.BUFFERING) {
      setSongUi(mascota, "loading", "");
    } else if (state === window.YT.PlayerState.PAUSED) {
      if (activeSongId === mascota.id) activeSongId = null;
      setSongUi(mascota, "paused", "");
    } else if (state === window.YT.PlayerState.ENDED) {
      if (activeSongId === mascota.id) activeSongId = null;
      setSongUi(mascota, "paused", "");
    }
  }

  function handleSongError(mascota, code) {
    const messages = {
      2: "El enlace de la canción no es válido.",
      5: "El navegador no pudo reproducir este video.",
      100: "El video de la canción ya no está disponible.",
      101: "El dueño de este video no permite reproducirlo fuera de YouTube.",
      150: "El dueño de este video no permite reproducirlo fuera de YouTube.",
      153: "YouTube no pudo validar el origen del sitio. Abrí la página con iniciar.bat (http://localhost:8000) en lugar del archivo local."
    };

    if (activeSongId === mascota.id) {
      activeSongId = null;
    }

    setSongUi(
      mascota,
      "paused",
      messages[code] || "No se pudo reproducir la canción (código " + code + ")."
    );
  }

  function pauseOtherSongs(exceptId) {
    songPlayers.forEach(function (entry, mascotaId) {
      if (mascotaId === exceptId || !entry.ready || !entry.player) return;

      try {
        const state = entry.player.getPlayerState();
        if (state === 1 || state === 3) {
          entry.player.pauseVideo();
        }
      } catch (error) {
        console.info("No se pudo pausar otra canción.");
      }
    });
  }

  async function toggleSong(mascota) {
    if (window.location.protocol === "file:") {
      setSongUi(
        mascota,
        "paused",
        "YouTube bloquea la reproducción desde archivos locales. Abrí el sitio con iniciar.bat y volvé a intentar."
      );
      return;
    }

    const cancion = mascota.cancion || {};
    const videoId = youtubeId(cancion.embedUrl || cancion.url || "");

    if (!videoId) {
      setSongUi(mascota, "paused", "No hay un video de YouTube válido para esta canción.");
      return;
    }

    let entry = songPlayers.get(mascota.id);

    if (entry && entry.ready && entry.player) {
      let state = -1;

      try {
        state = entry.player.getPlayerState();
      } catch (error) {
        state = -1;
      }

      if (state === 1 || state === 3) {
        entry.player.pauseVideo();
        setSongUi(mascota, "paused", "");
        return;
      }

      pauseOtherSongs(mascota.id);
      entry.player.playVideo();
      setSongUi(mascota, "loading", "");
      return;
    }

    if (entry && entry.loading) {
      return;
    }

    if (entry && !entry.ready) {
      resetSongPlayer(mascota.id);
      entry = null;
    }

    if (!entry) {
      try {
        entry = createSongPlayer(mascota, videoId);
      } catch (error) {
        setSongUi(mascota, "paused", error.message);
        return;
      }
    }

    setSongUi(mascota, "loading", "");

    try {
      const player = await entry.readyPromise;
      pauseOtherSongs(mascota.id);
      player.playVideo();
    } catch (error) {
      setSongUi(
        mascota,
        "paused",
        "No se pudo preparar la canción. Revisá tu conexión a internet."
      );
    }
  }

  function initSongChip(section, mascota) {
    const chip = section.querySelector("[data-song]");
    if (!chip || !mascota.cancion) return;

    chip.addEventListener("click", function () {
      toggleSong(mascota);
    });
  }

  function preloadSongPlayers(mascotas) {
    if (window.location.protocol === "file:") return;

    const conCancion = mascotas.filter(function (mascota) {
      return mascota.cancion && youtubeId(mascota.cancion.embedUrl || "");
    });

    if (!conCancion.length) return;

    window.setTimeout(function () {
      loadYouTubeApi()
        .then(function () {
          conCancion.forEach(function (mascota) {
            if (songPlayers.has(mascota.id)) return;

            const videoId = youtubeId(mascota.cancion.embedUrl || "");
            if (videoId) {
              createSongPlayer(mascota, videoId);
            }
          });
        })
        .catch(function () {});
    }, 1200);
  }

  function setModalLink(href, label, note) {
    const link = document.getElementById("mediaModalLink");
    const noteEl = document.getElementById("mediaModalNote");

    if (href) {
      link.href = href;
      link.innerHTML = escapeHtml(label || "Abrir original") +
        ' <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i>';
      link.classList.remove("is-hidden");
    } else {
      link.removeAttribute("href");
      link.classList.add("is-hidden");
    }

    if (note) {
      noteEl.textContent = note;
      noteEl.classList.remove("is-hidden");
    } else {
      noteEl.textContent = "";
      noteEl.classList.add("is-hidden");
    }
  }

  function openMedia(options) {
    const title = document.getElementById("mediaModalTitle");
    const kicker = document.getElementById("mediaModalKicker");
    const body = document.getElementById("mediaModalBody");

    title.textContent = options.title || "Recuerdo";
    kicker.textContent = options.kicker || "Recuerdo";
    body.innerHTML = options.html || "";
    guardBrokenImages(body);
    setModalLink(options.href, options.linkLabel, options.note);

    if (!mediaModal) {
      if (options.href) window.open(options.href, "_blank", "noopener");
      return;
    }

    mediaModal.show();
  }

  function openRecuerdo(record) {
    if (!record) return;

    const src = imageUrl(record, SIZE_MODAL);
    const poster = imageUrl(record, SIZE_MODAL);
    const note = record.url ? "El recuerdo original también está disponible en Google Photos." : "";
    let html = "";

    if (record.tipo === "video" && record.video) {
      html =
        '<video class="media-video" controls playsinline preload="metadata"' +
        (poster ? ' poster="' + escapeHtml(poster) + '"' : "") + ">" +
        '<source src="' + escapeHtml(record.video) + '" type="video/mp4">' +
        "Tu navegador no puede reproducir este video." +
        "</video>";
    } else if (src) {
      html =
        '<img class="media-photo" src="' + escapeHtml(src) + '" alt="' +
        escapeHtml(record.nombre) + '">';
    } else {
      const embed = resolveEmbed(record.url);
      html = embed || fallbackPanel(
        record.nombre,
        "Este recuerdo está alojado fuera de la página. Abrilo desde el enlace para verlo completo.",
        record.url,
        "Ver recuerdo"
      );
    }

    openMedia({
      title: record.nombre,
      kicker: typeLabel(record.tipo),
      html: html,
      href: record.url || (record.video || src || null),
      linkLabel: "Abrir original",
      note: note
    });

    const body = document.getElementById("mediaModalBody");
    const photo = body.querySelector(".media-photo");
    if (photo) {
      photo.addEventListener(
        "error",
        function () {
          body.innerHTML = fallbackPanel(
            record.nombre,
            "No pudimos mostrar la imagen acá. Abrila desde el enlace original.",
            record.url,
            "Ver recuerdo"
          );
        },
        { once: true }
      );
    }
  }

  function resolveEmbed(url) {
    if (!url) return null;

    const yt = youtubeId(url);
    if (yt) {
      return '<iframe class="media-frame" src="https://www.youtube.com/embed/' +
        encodeURIComponent(yt) + '?autoplay=1&rel=0" title="Video de YouTube" ' +
        'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" ' +
        "allowfullscreen></iframe>";
    }

    const drive = driveId(url);
    if (drive) {
      return '<iframe class="media-frame" src="https://drive.google.com/file/d/' +
        encodeURIComponent(drive) + '/preview" title="Video" allow="autoplay" allowfullscreen></iframe>';
    }

    return null;
  }

  function initMediaModal() {
    const modalEl = document.getElementById("mediaModal");
    if (!modalEl) return;

    if (window.bootstrap && window.bootstrap.Modal) {
      mediaModal = new window.bootstrap.Modal(modalEl);
    }

    modalEl.addEventListener("hidden.bs.modal", function () {
      const body = document.getElementById("mediaModalBody");
      body.querySelectorAll("video").forEach(function (video) {
        video.pause();
      });
      body.innerHTML = "";
    });
  }

  function initReveal() {
    const items = document.querySelectorAll(".reveal");

    if (!("IntersectionObserver" in window)) {
      items.forEach(function (item) { item.classList.add("is-visible"); });
      return;
    }

    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" }
    );

    items.forEach(function (item) { observer.observe(item); });
  }

  async function init() {
    const app = document.getElementById("app");
    initMediaModal();

    let data;
    try {
      data = await loadData();
    } catch (error) {
      app.innerHTML =
        '<div class="alert alert-warning border-0 rounded-4 p-4">' +
        '<i class="bi bi-exclamation-triangle-fill me-2" aria-hidden="true"></i>' +
        "No se pudieron cargar los recuerdos. Revisá que <strong>mascotas.json</strong> " +
        "y <strong>js/data.js</strong> estén junto a esta página." +
        "</div>";
      return;
    }

    const mascotas = Array.isArray(data.mascotas) ? data.mascotas : [];
    const recuerdos = Array.isArray(data.recuerdos) ? data.recuerdos : [];

    app.innerHTML = "";

    if (!mascotas.length) {
      app.innerHTML =
        '<div class="recuerdos-empty">Todavía no hay mascotas para mostrar.</div>';
      return;
    }

    mascotas.forEach(function (mascota) {
      const propios = recuerdos.filter(function (record) {
        return record.mascotaId === mascota.id;
      });
      app.appendChild(renderMascota(mascota, propios));
    });

    initReveal();
    preloadSongPlayers(mascotas);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
