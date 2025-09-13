'use strict';

window.addEventListener('DOMContentLoaded', () => {
    const pageImage = document.getElementById('page-image');
    const pageCounter = document.getElementById('page-counter');
    const prevButton = document.getElementById('prev-button');
    const nextButton = document.getElementById('next-button');

    let images = [];
    let currentPage = 0;

    // Use the exposed API from the preload script to receive image data
    window.electronAPI.onReceiveCbzImages((event, image_data) => {
        images = image_data;
        currentPage = 0;
        updateViewer();
    });

    function updateViewer() {
        if (images.length === 0) {
            pageImage.src = '';
            pageCounter.textContent = 'No images found';
            prevButton.disabled = true;
            nextButton.disabled = true;
            return;
        }

        pageImage.src = images[currentPage];
        pageCounter.textContent = `Page ${currentPage + 1} / ${images.length}`;
        prevButton.disabled = currentPage === 0;
        nextButton.disabled = currentPage >= images.length - 1;
    }

    prevButton.addEventListener('click', () => {
        if (currentPage > 0) {
            currentPage--;
            updateViewer();
        }
    });

    nextButton.addEventListener('click', () => {
        if (currentPage < images.length - 1) {
            currentPage++;
            updateViewer();
        }
    });

    // Initial state
    updateViewer();
});
