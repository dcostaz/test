'use strict';

window.addEventListener('DOMContentLoaded', () => {
    const imageContainer = /** @type {HTMLDivElement} */ (document.getElementById('image-container'));
    const prevBtn = /** @type {HTMLButtonElement} */ (document.getElementById('prev-chapter'));
    const nextBtn = /** @type {HTMLButtonElement} */ (document.getElementById('next-chapter'));
    const chapterInfo = /** @type {HTMLSpanElement} */ (document.getElementById('chapter-info'));

    let chapterList = [];
    let currentIndex = -1;

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

        if (!data.images || data.images.length === 0) {
            imageContainer.textContent = 'No images found.';
            return;
        }

        // Create and append an img element for each image
        data.images.forEach(imageSrc => {
            const img = document.createElement('img');
            img.src = imageSrc;
            img.alt = 'Manga Page';
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
    }

    window.viewerAPI.onInitialChapterData((data) => {
        render(data);
    });

    window.viewerAPI.onChapterLoaded((data) => {
        render(data);
    });

    prevBtn.addEventListener('click', () => {
        if (currentIndex > 0) {
            window.viewerAPI.getChapter(currentIndex - 1);
        }
    });

    nextBtn.addEventListener('click', () => {
        if (currentIndex < chapterList.length - 1) {
            window.viewerAPI.getChapter(currentIndex + 1);
        }
    });

    // Request the initial chapter
    window.viewerAPI.getInitialChapter();
});
