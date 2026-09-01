// Anno corrente nel footer
document.getElementById('year').textContent = new Date().getFullYear();

// Header fisso: si posiziona subito sotto la demo-bar, la cui altezza varia
// con il wrap del testo su viewport stretti (misurata invece di essere ipotizzata).
const demoBar = document.querySelector('.demo-bar');
function syncDemoBarHeight() {
  if (demoBar) {
    document.documentElement.style.setProperty('--demo-bar-h', demoBar.offsetHeight + 'px');
  }
}
syncDemoBarHeight();
window.addEventListener('resize', syncDemoBarHeight, { passive: true });

// Header: sfondo dopo lo scroll
const header = document.getElementById('site-header');
const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 10);
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });

// Menu mobile
const navToggle = document.getElementById('nav-toggle');
navToggle.addEventListener('click', () => {
  const isOpen = header.classList.toggle('nav-open');
  navToggle.setAttribute('aria-expanded', String(isOpen));
});
document.querySelectorAll('.mobile-nav a').forEach(link => {
  link.addEventListener('click', () => {
    header.classList.remove('nav-open');
    navToggle.setAttribute('aria-expanded', 'false');
  });
});

// Reveal on scroll
const revealEls = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  revealEls.forEach(el => io.observe(el));
} else {
  revealEls.forEach(el => el.classList.add('is-visible'));
}

// ---------- Hero: video cinematico con scrubbing deterministico legato allo scroll ----------
// currentTime del video = p * duration, p (0→1) calcolato dalla posizione di scroll.
// Timecode reali (analizzati su elan-hero-master.mp4, 10.04s): CUT 0.5–2.5s (macro
// strutturata), COLOR 6.0–7.2s (luce calda), FORM 7.6–8.7s (silhouette/volume),
// composizione finale stabile 9–10s (spazio di lettura per l'headline).
const heroScroll = document.getElementById('hero-scroll');
const heroVideo = document.getElementById('hero-video');
const heroFrame = document.getElementById('hero-frame');
const heroIntro = document.getElementById('hero-intro');
const heroWords = document.querySelectorAll('.hero-word');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (heroScroll && heroVideo) {
  // Sorgente desktop più definita (1080x1920) contro la versione leggera mobile
  // (720x1280): scelta una sola volta, prima che il download parta davvero, per
  // evitare di scaricare due file. Il breakpoint replica quello usato nel CSS.
  const isDesktopViewport = window.matchMedia('(min-width: 900px)').matches;
  const desktopSrc = heroVideo.dataset.srcDesktop;
  const mobileSrc = heroVideo.dataset.srcMobile;
  if (isDesktopViewport && desktopSrc && heroVideo.getAttribute('src') !== desktopSrc) {
    heroVideo.setAttribute('src', desktopSrc);
  } else if (!isDesktopViewport && mobileSrc) {
    heroVideo.setAttribute('src', mobileSrc);
  }

  const steps = [
    { word: 0, from: 0.05, to: 0.25 },  // CUT
    { word: 1, from: 0.60, to: 0.72 },  // COLOR
    { word: 2, from: 0.76, to: 0.87 },  // FORM
  ];

  // Finché questo è false, lo scroll continua a essere ascoltato (nessun blocco,
  // nessun loader) ma updateScrub si ferma dopo aver aggiornato --p: CUT/COLOR/FORM
  // e il video restano fermi sul loro stato iniziale invece di "correre avanti"
  // indipendentemente da un video che non può ancora eseguire il seek richiesto.
  let videoReady = false;
  let updateScrub = null; // assegnata più sotto; qui serve solo il riferimento per il sync immediato
  function onVideoReady() {
    heroVideo.classList.add('is-ready');
    videoReady = true;
    if (updateScrub) updateScrub(); // sync immediato sulla posizione di scroll reale, niente attesa del prossimo scroll event
  }

  // Pre-seek invisibile su alcuni punti sparsi del file, video ancora a opacità 0:
  // forza il browser a scaricare in anticipo più regioni via richieste HTTP range,
  // invece delle sole prime frazioni di secondo che il preload sequenziale coprirebbe
  // da solo. Annullato subito se l'utente inizia davvero a scrollare.
  let warmupCancel = null;
  function warmupBuffer(done) {
    const d = heroVideo.duration;
    if (!d || !isFinite(d)) { done(); return; }
    const points = [d * 0.85, d * 0.45, d * 0.65, 0];
    let i = 0;
    let finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      heroVideo.removeEventListener('seeked', step);
      clearTimeout(budget);
      warmupCancel = null;
      done();
    }
    function step() {
      if (finished) return;
      if (i >= points.length) { finish(); return; }
      heroVideo.currentTime = points[i++];
    }
    warmupCancel = () => { heroVideo.currentTime = 0; finish(); };
    heroVideo.addEventListener('seeked', step);
    const budget = setTimeout(warmupCancel, 700);
    step();
  }

  // Priming per iOS Safari / Android Chrome: un <video> mai avviato non decodifica
  // nuovi fotogrammi quando si assegna currentTime da JS (resta bloccato sul primo
  // frame). Avviare la riproduzione (muted + playsinline non richiede gesture utente)
  // e metterla subito in pausa "sblocca" il decoder.
  let primed = false;
  function primeVideoForScrub() {
    if (primed) return;
    primed = true;
    const afterPlay = () => {
      heroVideo.pause();
      const proceed = () => {
        if (reduceMotion) { onVideoReady(); } else { warmupBuffer(onVideoReady); }
      };
      // play() può risolvere anche con dati minimi (o fallire e finire nel .catch):
      // prima di fidarsi che il decoder sia davvero pronto per un seek arbitrario,
      // verifica HAVE_CURRENT_DATA reale invece di assumerlo dal solo loadedmetadata.
      if (heroVideo.readyState >= 2) {
        proceed();
      } else {
        const onCanPlay = () => { clearTimeout(fallback); proceed(); };
        const fallback = setTimeout(() => { heroVideo.removeEventListener('canplay', onCanPlay); proceed(); }, 800);
        heroVideo.addEventListener('canplay', onCanPlay, { once: true });
      }
    };
    const playPromise = heroVideo.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise.then(afterPlay).catch(afterPlay);
    } else {
      afterPlay();
    }
  }
  if (heroVideo.readyState >= 1) {
    primeVideoForScrub();
  } else {
    heroVideo.addEventListener('loadedmetadata', primeVideoForScrub, { once: true });
  }

  if (reduceMotion) {
    // Nessun lungo scroll-scrub: composizione finale statica, testo subito leggibile
    heroScroll.style.setProperty('--p', '1');
    if (heroFrame) heroFrame.classList.add('is-visible');
    function showFinalFrame() {
      heroVideo.currentTime = Math.max(0, heroVideo.duration - 0.05);
    }
    if (heroVideo.readyState >= 1) showFinalFrame();
    heroVideo.addEventListener('loadedmetadata', showFinalFrame, { once: true });
  } else {
    heroScroll.classList.add('js-scrub');
    let ticking = false;
    let lastTime = -1;

    updateScrub = function () {
      ticking = false;
      const rect = heroScroll.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const raw = total > 0 ? -rect.top / total : 0;
      const p = Math.min(Math.max(raw, 0), 1);
      heroScroll.style.setProperty('--p', p.toFixed(4));

      // Il video non può ancora eseguire il seek richiesto (decoder non sbloccato /
      // dati insufficienti): niente testo che avanza né currentTime impostato finché
      // non arriva onVideoReady, che richiama subito questa funzione per recuperare
      // in un colpo solo la posizione corrente, senza inseguimenti animati.
      if (!videoReady) return;

      const activeStep = steps.find(s => p >= s.from && p < s.to);
      heroWords.forEach(w => {
        w.classList.toggle('is-active', !!activeStep && Number(w.dataset.step) === activeStep.word);
      });
      if (heroFrame) heroFrame.classList.toggle('is-visible', p >= 0.90);
      if (heroIntro) heroIntro.classList.toggle('is-hidden', p >= 0.04);

      // currentTime = f(scroll): mappatura diretta e deterministica, nessuna inerzia.
      // Se il video non è pronto (o fallisce), --p continua comunque ad aggiornarsi:
      // testo e CTA restano utilizzabili anche senza video.
      const d = heroVideo.duration;
      if (!d || !isFinite(d)) return;
      const t = p * d;
      if (Math.abs(t - lastTime) > 0.008) {
        heroVideo.currentTime = t;
        lastTime = t;
      }
    };
    function onHeroScroll() {
      // Lo scroll reale dell'utente ha sempre la priorità sul warm-up in corso
      if (warmupCancel) { const cancel = warmupCancel; warmupCancel = null; cancel(); }
      if (!ticking) { requestAnimationFrame(updateScrub); ticking = true; }
    }

    // Ascolta lo scroll solo mentre la hero è vicina al viewport: zero costo altrove
    const heroObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          window.addEventListener('scroll', onHeroScroll, { passive: true });
          updateScrub();
        } else {
          window.removeEventListener('scroll', onHeroScroll);
        }
      });
    }, { rootMargin: '0px' });
    heroObserver.observe(heroScroll);

    window.addEventListener('resize', updateScrub, { passive: true });
  }
} else if (heroFrame) {
  heroFrame.classList.add('is-visible');
}
