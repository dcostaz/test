'use strict';

window.addEventListener('DOMContentLoaded', () => {
    const imageContainer = document.getElementById('image-container');
    const prevBtn = document.getElementById('prev-chapter');
    const nextBtn = document.getElementById('next-chapter');
    const chapterInfo = document.getElementById('chapter-info');

    let chapterList = [];
    let currentIndex = -1;

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
