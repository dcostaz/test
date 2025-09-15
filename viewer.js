'use strict';

window.addEventListener('DOMContentLoaded', () => {
    const imageContainer = /** @type {HTMLDivElement} */ (document.getElementById('image-container'));
    const prevBtn = /** @type {HTMLButtonElement} */ (document.getElementById('prev-chapter'));
    const nextBtn = /** @type {HTMLButtonElement} */ (document.getElementById('next-chapter'));
    const zoomInBtn = /** @type {HTMLButtonElement} */ (document.getElementById('zoom-in'));
    const zoomOutBtn = /** @type {HTMLButtonElement} */ (document.getElementById('zoom-out'));
    const chapterInfo = /** @type {HTMLSpanElement} */ (document.getElementById('chapter-info'));
    const chapterListElement = /** @type {HTMLUListElement} */ (document.getElementById('chapter-list'));

    /** @type {string[]} */
    let chapterList = [];

    /** @type {number} */
    let currentIndex = -1;
    let zoom = 100;

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
            img.style.width = `${zoom}%`;
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

    /**
     * Updates the zoom level of the images.
     * @param {number} newZoom - The new zoom level.
     */
    function updateZoom(newZoom) {
        zoom = Math.max(70, Math.min(130, newZoom)); // Clamp zoom between 70 and 130
        const images = imageContainer.querySelectorAll('img');
        images.forEach(img => {
            img.style.width = `${zoom}%`;
        });
    }

    // Zoom In Button event listener
    zoomInBtn.addEventListener('click', () => {
        updateZoom(zoom + 5);
    });

    // Zoom Out Button event listener
    zoomOutBtn.addEventListener('click', () => {
        updateZoom(zoom - 5);
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
