'use strict';

window.addEventListener('DOMContentLoaded', () => {
    const imageContainer = /** @type {HTMLDivElement} */ (document.getElementById('image-container'));
    const prevBtn = /** @type {HTMLButtonElement} */ (document.getElementById('prev-chapter'));
    const nextBtn = /** @type {HTMLButtonElement} */ (document.getElementById('next-chapter'));
    const zoomInBtn = /** @type {HTMLButtonElement} */ (document.getElementById('zoom-in'));
    const zoomOutBtn = /** @type {HTMLButtonElement} */ (document.getElementById('zoom-out'));
    const zoomResetBtn = /** @type {HTMLButtonElement} */ (document.getElementById('zoom-reset'));
    const chapterInfo = /** @type {HTMLSpanElement} */ (document.getElementById('chapter-info'));
    const chapterListElement = /** @type {HTMLUListElement} */ (document.getElementById('chapter-list'));

    /** @type {string[]} */
    let chapterList = [];

    /** @type {number} */
    let currentIndex = -1;
    let zoom = 100;

    /**
     * Applies the current zoom level to a single image.
     * @param {HTMLImageElement} img
     */
    function applyZoomToImage(img) {
        if (zoom === 100) {
            // Reset to default responsive behavior
            img.style.width = '100%';
            img.style.maxWidth = '100%';
            delete img.dataset.baseWidth;
        } else {
            // If we need a base width (for pixel-based zooming) and don't have one, get it.
            // This happens on the first zoom away from 100%.
            if (!img.dataset.baseWidth) {
                img.dataset.baseWidth = img.clientWidth;
            }

            const baseWidth = parseFloat(img.dataset.baseWidth);
            if (baseWidth > 0) { // Ensure image was loaded and has a width
                const newPixelWidth = baseWidth * (zoom / 100);
                img.style.width = `${newPixelWidth}px`;
                img.style.maxWidth = 'none'; // Allow image to exceed container width
            }
        }
    }

    /**
     * Updates the zoom level for all images.
     * @param {number} newZoom - The new zoom level.
     */
    function updateZoom(newZoom) {
        zoom = Math.max(70, Math.min(130, newZoom)); // Clamp zoom
        const images = imageContainer.querySelectorAll('img');
        images.forEach(img => {
            // Ensure the image is loaded before trying to get its width
            if (img.complete) {
                applyZoomToImage(img);
            }
        });
    }

    /**
     * Renders the chapter data in the viewer.
     *
     * @param {Object} data - The chapter data to render.
     * @param {string[]} data.images - The list of image URLs for the chapter.
     * @param {string} data.chapter - The chapter title.
     * @param {string[]} data.chapterList - The list of all chapter titles.
     * @param {number} data.currentIndex - The index of the current chapter.
     */
    function render(data) {
        // Clear existing images
        imageContainer.innerHTML = '';
        imageContainer.scrollTop = 0;

        if (!data.images || data.images.length === 0) {
            imageContainer.textContent = 'No images found.';
            return;
        }

        // Create and append an img element for each image
        data.images.forEach(imageSrc => {
            const img = document.createElement('img');
            img.src = imageSrc;
            img.alt = 'Manga Page';
            // Set initial width to 100% so it fills the container before any zooming.
            img.style.width = '100%';
            img.style.maxWidth = '100%';

            img.onload = () => {
                // Apply the current zoom state to the new image once it's loaded.
                // This is crucial for when chapters are changed while zoomed in.
                applyZoomToImage(img);
            };

            imageContainer.appendChild(img);
        });

        // Update state
        chapterList = data.chapterList;
        currentIndex = data.currentIndex;

        // Update chapter info
        chapterInfo.textContent = `${data.chapter} (${currentIndex + 1}/${chapterList.length})`;

        // Update button states
        prevBtn.disabled = currentIndex === 0;
        nextBtn.disabled = currentIndex === chapterList.length - 1;

        renderChapterList();
    }

    /**
     * Renders the chapter list in the chapter list container.
     */
    function renderChapterList() {
        chapterListElement.innerHTML = '';
        chapterList.forEach((chapter, index) => {
            const li = document.createElement('li');
            li.textContent = chapter;
            li.addEventListener('click', () => {
                if (index !== currentIndex) {
                    // Clear existing images
                    imageContainer.innerHTML = '';
                    imageContainer.scrollTop = 0;

                    prevBtn.disabled = true;
                    nextBtn.disabled = true;
                    window.viewerAPI.getChapter(index);
                }
            });
            chapterListElement.appendChild(li);
        });
    }

    window.viewerAPI.onInitialChapterData((data) => {
        render(data);
    });

    window.viewerAPI.onChapterLoaded((data) => {
        render(data);
    });

    /**
     * Helper that handles the previous chapter request.
     */
    const previousChapter = () => {
        if (currentIndex > 0) {
            // Clear existing images
            imageContainer.innerHTML = '';
            imageContainer.scrollTop = 0;

            prevBtn.disabled = true;
            nextBtn.disabled = true;

            window.viewerAPI.getChapter(currentIndex - 1);
        }
    };

    /**
     * Helper that handles the next chapter request.
     */
    const nextChapter = () => {
        if (currentIndex < chapterList.length - 1) {
            // Clear existing images
            imageContainer.innerHTML = '';
            imageContainer.scrollTop = 0;

            prevBtn.disabled = true;
            nextBtn.disabled = true;

            window.viewerAPI.getChapter(currentIndex + 1);
        }
    };

    // Previous Chapter Button event listeners
    prevBtn.addEventListener('click', previousChapter);

    // Next Chapter Button event listeners
    nextBtn.addEventListener('click', nextChapter);

    // Zoom In Button event listener
    zoomInBtn.addEventListener('click', () => {
        updateZoom(zoom + 5);
    });

    // Zoom Out Button event listener
    zoomOutBtn.addEventListener('click', () => {
        updateZoom(zoom - 5);
    });

    // Zoom Reset Button event listener
    zoomResetBtn.addEventListener('click', () => {
        updateZoom(100);
    });

    // Keyboard navigation
    document.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowLeft') {
            previousChapter();
        } else if (event.key === 'ArrowRight') {
            nextChapter();
        } else if (event.key === 'Escape') {
            window.close();
        } else if (event.key === ' ') {
            imageContainer.scrollBy({
                top: window.innerHeight * 0.65,
                behavior: "smooth"
            });
            event.preventDefault();
        } else if (event.key === "PageUp") {
            imageContainer.scrollBy({
                top: -window.innerHeight * 0.9,
                behavior: "smooth"
            });
        } else if (event.key === "PageDown") {
            imageContainer.scrollBy({
                top: window.innerHeight * 0.9,
                behavior: "smooth"
            });
        } else if (event.key === "Home") {
            // Scroll to top
            imageContainer.scrollTo({
                top: 0,
                behavior: "auto"
            });
        }
        else if (event.key === "End") {
            // Scroll to bottom
            imageContainer.scrollTo({
                top: imageContainer.scrollHeight,
                behavior: "auto"
            });
        }
    });

    // Request the initial chapter
    window.viewerAPI.getInitialChapter();
});
