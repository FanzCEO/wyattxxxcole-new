/**
 * WYATT XXX COLE - Visual Effects
 * Country Boy Aesthetic
 */

document.addEventListener('DOMContentLoaded', function() {
    initCursor();
    initParallax();

    // Remove any existing particle canvas (cleanup from old cache)
    const oldCanvas = document.getElementById('particles');
    if (oldCanvas) oldCanvas.remove();
});

/**
 * Custom Cursor
 */
function initCursor() {
    // Only on desktop
    if (window.innerWidth < 768) return;

    const cursor = document.createElement('div');
    cursor.className = 'custom-cursor';
    cursor.innerHTML = `
        <div class="cursor-dot"></div>
        <div class="cursor-ring"></div>
    `;

    const style = document.createElement('style');
    style.textContent = `
        .custom-cursor {
            position: fixed;
            pointer-events: none;
            z-index: 99999;
            mix-blend-mode: difference;
        }
        .cursor-dot {
            position: absolute;
            width: 8px;
            height: 8px;
            background: #D4C4A8;
            border-radius: 50%;
            transform: translate(-50%, -50%);
            transition: transform 0.1s ease;
        }
        .cursor-ring {
            position: absolute;
            width: 40px;
            height: 40px;
            border: 2px solid #C68E3F;
            border-radius: 50%;
            transform: translate(-50%, -50%);
            transition: all 0.15s ease;
            opacity: 0.5;
        }
        .cursor-hover .cursor-dot {
            transform: translate(-50%, -50%) scale(2);
            background: #C68E3F;
        }
        .cursor-hover .cursor-ring {
            transform: translate(-50%, -50%) scale(1.5);
            border-color: #A44A2A;
            opacity: 1;
        }
        @media (max-width: 768px) {
            .custom-cursor { display: none; }
        }
    `;
    document.head.appendChild(style);
    document.body.appendChild(cursor);

    let mouseX = 0, mouseY = 0;
    let cursorX = 0, cursorY = 0;

    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
    });

    // Hover effect on interactive elements
    document.querySelectorAll('a, button, .btn, .card, .gallery__item, .product').forEach(el => {
        el.addEventListener('mouseenter', () => cursor.classList.add('cursor-hover'));
        el.addEventListener('mouseleave', () => cursor.classList.remove('cursor-hover'));
    });

    function updateCursor() {
        cursorX += (mouseX - cursorX) * 0.15;
        cursorY += (mouseY - cursorY) * 0.15;
        cursor.style.left = cursorX + 'px';
        cursor.style.top = cursorY + 'px';
        requestAnimationFrame(updateCursor);
    }
    updateCursor();
}

/**
 * Parallax Effect
 */
function initParallax() {
    const parallaxElements = document.querySelectorAll('.hero__background');

    window.addEventListener('scroll', () => {
        const scrolled = window.pageYOffset;

        parallaxElements.forEach(el => {
            const speed = 0.3;
            el.style.transform = `translateY(${scrolled * speed}px)`;
        });
    });
}

/**
 * Card Tilt Effect
 */
document.querySelectorAll('.card, .product').forEach(card => {
    card.addEventListener('mousemove', function(e) {
        const rect = this.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const rotateX = (y - centerY) / 20;
        const rotateY = (centerX - x) / 20;

        this.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px)`;
    });

    card.addEventListener('mouseleave', function() {
        this.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) translateY(0)';
    });
});

/**
 * Magnetic Button Effect
 */
document.querySelectorAll('.btn--primary').forEach(btn => {
    btn.addEventListener('mousemove', function(e) {
        const rect = this.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;

        this.style.transform = `translate(${x * 0.2}px, ${y * 0.2}px)`;
    });

    btn.addEventListener('mouseleave', function() {
        this.style.transform = 'translate(0, 0)';
    });
});

console.log('%c WXXXC ', 'background: #0D0B09; color: #D4C4A8; font-size: 24px; font-weight: bold; padding: 10px 20px; font-family: serif;');
console.log('%c Country Bred. Fully Loaded. ', 'color: #C68E3F; font-style: italic;');
